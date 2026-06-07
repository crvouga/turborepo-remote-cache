/**
 * Cloudflare Worker bindings for the Turborepo remote cache Worker.
 *
 * Only `DOPPLER_TOKEN` is a Wrangler secret / `.dev.vars` binding. B2 creds,
 * cache bearer token, and all other config load from Doppler at boot.
 */
export type CacheWorkerEnv = {
  DOPPLER_TOKEN: string;
  DOPPLER_PROJECT?: string;
  DOPPLER_CONFIG?: string;
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

export function assertDopplerTokenBinding(env: CacheWorkerEnv): string {
  const raw = env.DOPPLER_TOKEN;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ConfigurationError(
      'DOPPLER_TOKEN is required (non-empty string). Set this Worker secret or add it to .dev.vars; remaining config is loaded from Doppler.'
    );
  }
  return raw.trim();
}

function readOptionalBinding(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function readDopplerScopeBindings(env: CacheWorkerEnv): {
  project: string | null;
  config: string | null;
} {
  return {
    project: readOptionalBinding(env.DOPPLER_PROJECT),
    config: readOptionalBinding(env.DOPPLER_CONFIG),
  };
}
