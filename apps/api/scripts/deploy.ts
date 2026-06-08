import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveVaultScope } from '@scripts/vault-yaml-defaults';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const { config: vaultConfig } = resolveVaultScope({
  envProject: process.env['VAULT_PROJECT'],
  envConfig: process.env['VAULT_CONFIG'],
});
const wranglerEnv = vaultConfig === 'dev' ? 'dev' : 'prd';

run('wrangler', ['deploy', '--env', wranglerEnv]);
