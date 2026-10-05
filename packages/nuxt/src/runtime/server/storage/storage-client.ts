import { S3Client } from "@aws-sdk/client-s3";

export function storageClient(value: string | undefined) {
  if (!value) throw new Error("NUXT_STORAGE_URL is not set");
  if (!URL.canParse(value)) throw new Error("NUXT_STORAGE_URL is not a valid URL");

  const url = new URL(value);

  return new S3Client({
    endpoint: url.origin,
    region: "us-east-1",
    forcePathStyle: true,
    // otherwise presigned PUT URLs carry an empty-body CRC32 no real upload matches
    requestChecksumCalculation: "WHEN_REQUIRED",
    requestHandler: { connectionTimeout: 5_000, socketTimeout: 30_000 },
    credentials: {
      accessKeyId: decodeURIComponent(url.username),
      secretAccessKey: decodeURIComponent(url.password),
    },
  });
}
