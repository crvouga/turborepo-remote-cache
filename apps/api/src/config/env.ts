/**
 * Cloudflare Worker bindings for the Turborepo remote cache Worker.
 *
 * Only `VAULT_TOKEN` is a Wrangler secret / `.dev.vars` binding. B2 creds,
 * cache bearer token, and all other config load from Vault at boot.
 */
export type CacheWorkerEnv = {
  VAULT_TOKEN: string;
  VAULT_ADDR?: string;
  VAULT_PROJECT?: string;
  VAULT_CONFIG?: string;
};

/**
 * Non-recoverable misconfiguration at the env trust boundary. Signals to the
 * top-level Worker handler that the isolate must latch a fatal state and
 * refuse to serve traffic.
 */
export class ConfigurationError extends Error {
  readonly __configuration_error = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function assertVaultTokenBinding(env: CacheWorkerEnv): string {
  const raw = env.VAULT_TOKEN;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ConfigurationError(
      'VAULT_TOKEN is required (non-empty string). Set this Worker secret or add it to .dev.vars; remaining config is loaded from Vault.'
    );
  }
  return raw.trim();
}

function readOptionalBinding(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function readVaultScopeBindings(env: CacheWorkerEnv): {
  addr: string | null;
  project: string | null;
  config: string | null;
} {
  return {
    addr: readOptionalBinding(env.VAULT_ADDR),
    project: readOptionalBinding(env.VAULT_PROJECT),
    config: readOptionalBinding(env.VAULT_CONFIG),
  };
}
