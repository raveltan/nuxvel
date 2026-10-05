import type { S3Client } from "@aws-sdk/client-s3";
import { useRuntimeConfig } from "nitropack/runtime";
import { useS3 } from "./client";
import { storageClient } from "./storage-client";

let client: S3Client | undefined;

export function useSigningS3() {
  const { storageUrl, storagePublicUrl } = useRuntimeConfig();

  if (!storagePublicUrl) return useS3();

  client ??= storageClient(publicStorageUrl(storageUrl, storagePublicUrl));

  return client;
}

function publicStorageUrl(storageUrl: string, publicUrl: string) {
  const url = new URL(publicUrl);
  const credentials = new URL(storageUrl);

  url.username = credentials.username;
  url.password = credentials.password;

  return url.href;
}
