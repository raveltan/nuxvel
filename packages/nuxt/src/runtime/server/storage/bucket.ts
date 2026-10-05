import { useRuntimeConfig } from "nitropack/runtime";

/**
 * The name of the app's bucket, `NUXT_STORAGE_BUCKET`: where uploads land
 * and where {@link promoteUpload} and {@link signedReadUrl} work.
 *
 * Auto-imported on the server. Pass it as `Bucket` to any
 * `@aws-sdk/client-s3` command sent through {@link useS3}.
 *
 * Throws when `NUXT_STORAGE_BUCKET` is not set.
 *
 * @example
 * ```ts
 * await useS3().send(new DeleteObjectCommand({ Bucket: useBucket(), Key: key }));
 * ```
 */
export function useBucket(): string {
  const bucket = useRuntimeConfig().storageBucket;

  if (!bucket) throw new Error("NUXT_STORAGE_BUCKET is not set");

  return bucket;
}
