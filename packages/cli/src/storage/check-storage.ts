import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fail } from "../ui/fail.ts";
import { requiredEnv, s3Client } from "./setup-storage.ts";

const BODY = "nuxvel storage check";

function signedPut(s3: S3Client, bucket: string, key: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentLength: BODY.length, ContentType: "text/plain" }),
    { expiresIn: 60, signableHeaders: new Set(["content-length", "content-type"]) },
  );
}

async function exists(s3: S3Client, bucket: string, key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
    () => true,
    () => false,
  );
}

export async function checkStorage() {
  const bucket = requiredEnv("NUXT_STORAGE_BUCKET");
  const s3 = s3Client(requiredEnv("NUXT_STORAGE_URL"));
  const key = `tmp/storage-check/${randomUUID()}`;

  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: BODY }));
    const read = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

    if ((await read.Body?.transformToString()) !== BODY) fail(`${bucket} returned different content for ${key}`);

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

    if (await exists(s3, bucket, key)) fail(`${bucket} still has ${key} after deleting it`);

    const put = (body: string) =>
      signedPut(s3, bucket, key).then((url) => fetch(url, { method: "PUT", headers: { "content-type": "text/plain" }, body }));
    const matching = await put(BODY);

    if (!matching.ok) fail(`${bucket} refused a presigned upload that matches its signed headers (${matching.status})`);

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    const oversized = await put(`${BODY} and more`);

    if (oversized.ok) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      fail(`${bucket} accepted an upload longer than its signed Content-Length`, {
        hint: "Use a storage backend that checks signed headers, such as SeaweedFS, S3 or R2",
      });
    }

    return { bucket };
  } finally {
    s3.destroy();
  }
}
