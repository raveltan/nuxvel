import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";

function testS3() {
  const url = new URL(TEST_STORAGE_URL);

  return new S3Client({
    endpoint: url.origin,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: decodeURIComponent(url.username),
      secretAccessKey: decodeURIComponent(url.password),
    },
  });
}

export async function ensureBucket(bucket: string) {
  const s3 = testS3();

  await s3
    .send(new HeadBucketCommand({ Bucket: bucket }))
    .catch(() => s3.send(new CreateBucketCommand({ Bucket: bucket })));
}

export async function storedObjectSize(bucket: string, key: string) {
  const object = await testS3()
    .send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    .catch(() => undefined);

  return object?.ContentLength;
}

export async function storedObject(bucket: string, key: string) {
  const object = await testS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  return { contentType: object.ContentType, body: Buffer.from((await object.Body?.transformToByteArray()) ?? []) };
}

export async function putObject(bucket: string, key: string, body: Uint8Array, contentType: string) {
  await testS3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}
