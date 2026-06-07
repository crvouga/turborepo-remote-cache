import { DopplerCli } from '@pkgs/doppler';
import { renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDopplerScope } from '@scripts/doppler-yaml-defaults';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(apiRoot, '.dev.vars');
const tmpPath = `${outPath}.${process.pid}.tmp`;

function encodeDevVarValue(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')}"`;
}

function tokenRequiresScopeParams(token: string): boolean {
  return !token.startsWith('dp.st.');
}

type DopplerScope = {
  token: string;
  project: string;
  config: string;
};

function resolveScope(): DopplerScope {
  const cli = new DopplerCli();
  let token: string;
  try {
    const resolved = cli.resolveToken();
    if (resolved.source === 'cli') {
      process.stdout.write(
        '[setup-dev-vars] DOPPLER_TOKEN not set in env; using `doppler configure get token --plain`.\n'
      );
    }
    token = resolved.token;
  } catch {
    process.stderr.write(
      '[setup-dev-vars] DOPPLER_TOKEN is required. Set it in env, or login/configure Doppler CLI.\n'
    );
    process.exit(1);
  }

  let project: string;
  let config: string;
  try {
    ({ project, config } = resolveDopplerScope({
      envProject: process.env['DOPPLER_PROJECT'],
      envConfig: process.env['DOPPLER_CONFIG'],
      configureProject: cli.tryConfigureGetProjectPlain(),
      configureConfig: cli.tryConfigureGetConfigPlain(),
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[setup-dev-vars] ${msg}\n`);
    process.exit(1);
  }

  if (tokenRequiresScopeParams(token)) {
    process.stdout.write(
      `[setup-dev-vars] scope: project=${project} config=${config}\n`
    );
  }

  return { token, project, config };
}

async function main(): Promise<void> {
  const { token, project, config } = resolveScope();
  const lines: string[] = [
    `DOPPLER_TOKEN=${encodeDevVarValue(token)}`,
    `DOPPLER_PROJECT=${encodeDevVarValue(project)}`,
    `DOPPLER_CONFIG=${encodeDevVarValue(config)}`,
  ];

  const body = `${lines.join('\n')}\n`;
  writeFileSync(tmpPath, body, { encoding: 'utf8' });
  renameSync(tmpPath, outPath);

  process.stdout.write(
    `[setup-dev-vars] wrote .dev.vars (${lines.map((l) => l.split('=')[0]).join(', ')})\n`
  );
}

await main();
