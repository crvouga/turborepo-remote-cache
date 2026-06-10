import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLY_APP_NAME } from '@scripts/vault-secrets-registry';

import { resolveFlyDeployOptions, runPipelineDeploy } from './fly-deploy';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function isCi(): boolean {
  return (
    process.env['GITHUB_ACTIONS'] === 'true' || process.env['CI'] === 'true'
  );
}

function run(cmd: string, args: string[], options?: { cwd?: string }): void {
  const result = spawnSync(cmd, args, {
    cwd: options?.cwd ?? repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isCi()) {
  await runPipelineDeploy(resolveFlyDeployOptions());
} else {
  const flyApp = process.env['FLY_APP']?.trim() || FLY_APP_NAME;
  process.stdout.write(
    `[deploy] building and deploying Fly app ${flyApp} from ${repoRoot}.\n`
  );
  run(
    'flyctl',
    [
      'deploy',
      '--app',
      flyApp,
      '--config',
      join(apiRoot, 'fly.toml'),
      '--dockerfile',
      join(apiRoot, 'Dockerfile'),
      '--ha=false',
      '--yes',
    ],
    { cwd: repoRoot }
  );
}
