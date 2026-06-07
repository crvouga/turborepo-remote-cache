import type { SecretStore } from '@pkgs/secret-store';
import {
  createCachingSecretStore,
  DopplerSecretStore,
} from '@pkgs/secret-store';

export type CreateCacheSecretStoreOptions = {
  readonly project?: string | null;
  readonly config?: string | null;
};

export function createCacheSecretStore(
  token: string,
  options: CreateCacheSecretStoreOptions = {}
): SecretStore {
  const project = options.project ?? null;
  const config = options.config ?? null;
  const store = new DopplerSecretStore({
    token,
    ...(project !== null ? { project } : {}),
    ...(config !== null ? { config } : {}),
  });
  return createCachingSecretStore(store, { ttlMs: 300_000 });
}
