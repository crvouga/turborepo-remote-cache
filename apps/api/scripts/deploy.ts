import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VaultCli } from '@pkgs/vault';
import { readVaultYamlDefaults } from '@scripts/vault-yaml-defaults';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function isCi(): boolean {
  return (
    process.env['GITHUB_ACTIONS'] === 'true' || process.env['CI'] === 'true'
  );
}

function run(cmd: string, args: string[], input?: string): void {
  const result = spawnSync(cmd, args, {
    cwd: apiRoot,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    env: process.env,
    input,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Deploy targets production by default. `vault run --config prd` does NOT
// export VAULT_CONFIG to this child process, so we must not rely on the
// `.vault.yaml` default (which is `dev` for local development) — doing so would
// deploy with the dev Vault scope. Only an explicit VAULT_CONFIG=dev opts into
// the dev scope.
const wranglerEnv =
  process.env['VAULT_CONFIG']?.trim() === 'dev' ? 'dev' : 'prd';

run('wrangler', ['deploy', '--env', wranglerEnv]);

// VAULT_TOKEN is the only Worker secret: the Worker uses it to authenticate to
// the secret-store at boot. wrangler keeps secrets across deploys, so this only
// needs to be (re)set when a durable token is available. In CI the only token
// available is the short-lived OIDC-derived one, which would expire and break
// the Worker at runtime — so CI relies on the persistent secret set out-of-band
// (or by a local deploy) instead of overwriting it here.
if (isCi()) {
  process.stdout.write(
    '[deploy] CI detected; leaving existing VAULT_TOKEN Worker secret untouched.\n'
  );
} else {
  const yaml = readVaultYamlDefaults();
  const cli = new VaultCli({ addr: yaml.addr, mount: yaml.mount });
  const { token, source } = cli.resolveToken();
  process.stdout.write(
    `[deploy] setting VAULT_TOKEN Worker secret (token source: ${source}).\n`
  );
  run(
    'wrangler',
    ['secret', 'put', 'VAULT_TOKEN', '--env', wranglerEnv],
    token
  );
}
