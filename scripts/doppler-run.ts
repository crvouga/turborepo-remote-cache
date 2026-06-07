/**
 * Run a command with secrets from Doppler.
 *
 * Defaults come from repo-root `doppler.yaml` (see `readDopplerYamlDefaults`).
 * Override with `DOPPLER_PROJECT` / `DOPPLER_CONFIG` (e.g. `DOPPLER_CONFIG=prd`
 * for infra / prod seeds).
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { resolveDopplerScope } from './doppler-yaml-defaults';

const REPO_ROOT = join(import.meta.dirname, '..');

const childArgs = process.argv.slice(2);
if (childArgs.length === 0) {
  console.error(
    'usage: bun run scripts/doppler-run.ts -- <command> [args…]\n' +
      'example: bun run scripts/doppler-run.ts -- turbo dev --ui=tui'
  );
  process.exit(1);
}

let project: string;
let config: string;
try {
  ({ project, config } = resolveDopplerScope({
    envProject: process.env['DOPPLER_PROJECT'],
    envConfig: process.env['DOPPLER_CONFIG'],
  }));
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`doppler-run: ${msg}`);
  process.exit(1);
}
const childEnv = { ...process.env };
delete childEnv['CURSOR_AGENT'];
delete childEnv['CURSOR_TRACE_ID'];

const result = spawnSync(
  'doppler',
  ['run', '-p', project, '-c', config, '--', ...childArgs],
  {
    cwd: REPO_ROOT,
    env: childEnv,
    stdio: 'inherit',
  }
);

if (result.error !== undefined) {
  console.error(
    `doppler-run: failed to spawn doppler: ${result.error.message}`
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
