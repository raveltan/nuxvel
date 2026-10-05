import type { S3Client } from "@aws-sdk/client-s3";
import { useRuntimeConfig } from "nitropack/runtime";
import { storageClient } from "./storage-client";

let client: S3Client | undefined;

/**
 * The app's S3 client, created once and reused.
 *
 * Auto-imported on the server. Named `useS3` rather than `useStorage` so it
 * never shadows Nitro's own `useStorage()`. Reads `NUXT_STORAGE_URL`, an
 * S3-compatible endpoint with the access key and secret as its user and
 * password — SeaweedFS from `docker compose` in development, managed S3 or
 * R2 in production. Use the client with any `@aws-sdk/client-s3` command.
 *
 * Throws when `NUXT_STORAGE_URL` is not set or not a URL. A call throws a
 * `TimeoutError` when the connection takes more than 5 seconds, or sends
 * and receives no data for 30 seconds.
 *
 * @example
 * ```ts
 * import { PutObjectCommand } from "@aws-sdk/client-s3";
 *
 * await useS3().send(
 *   new PutObjectCommand({ Bucket: "avatars", Key: "ada.png", Body: bytes }),
 * );
 * ```
 */
export function useS3() {
  client ??= storageClient(useRuntimeConfig().storageUrl);

  return client;
}

export function closeS3() {
  const closing = client;

  client = undefined;
  closing?.destroy();
}
