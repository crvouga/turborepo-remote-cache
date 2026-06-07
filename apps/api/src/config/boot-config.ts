import type { ObjectStore } from '@pkgs/object-store/interface';
import { ObjectStoreImplS3 } from '@pkgs/object-store/impl-s3';
import type { SecretStore } from '@pkgs/secret-store';

import { CacheSecretName } from '../config/secret-names';

export type CacheBootConfig = {
  readonly turboToken: string;
  readonly objectStore: ObjectStore;
};

export async function loadCacheBootConfig(
  secretStore: SecretStore
): Promise<CacheBootConfig> {
  const [turboToken, endpoint, region, accessKeyId, secretAccessKey, bucket] =
    await Promise.all([
      secretStore.getRequired(CacheSecretName.turboToken),
      secretStore.getRequired(CacheSecretName.b2S3Endpoint),
      secretStore.getRequired(CacheSecretName.b2S3Region),
      secretStore.getRequired(CacheSecretName.b2S3AccessKeyId),
      secretStore.getRequired(CacheSecretName.b2S3SecretAccessKey),
      secretStore.getRequired(CacheSecretName.b2Bucket),
    ]);

  const objectStore = new ObjectStoreImplS3({
    endpoint: endpoint.readSecretValue(),
    region: region.readSecretValue(),
    accessKeyId: accessKeyId.readSecretValue(),
    secretAccessKey: secretAccessKey.readSecretValue(),
    bucket: bucket.readSecretValue(),
  }).withPrefix('turbo-cache/');

  return {
    turboToken: turboToken.readSecretValue(),
    objectStore,
  };
}
