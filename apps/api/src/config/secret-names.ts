import { DopplerSecretKey } from '@scripts/doppler-secrets-registry';

/** Doppler secret names loaded at Worker boot. */
export const CacheSecretName = {
  turboToken: DopplerSecretKey.turboToken,
  b2S3Endpoint: DopplerSecretKey.b2S3Endpoint,
  b2S3Region: DopplerSecretKey.b2S3Region,
  b2S3AccessKeyId: DopplerSecretKey.b2S3AccessKeyId,
  b2S3SecretAccessKey: DopplerSecretKey.b2S3SecretAccessKey,
  b2Bucket: DopplerSecretKey.b2Bucket,
} as const;
