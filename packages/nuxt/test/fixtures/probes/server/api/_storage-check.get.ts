import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { useS3 } from "@nuxvel/nuxt/server/storage";

const bucket = "nuxvel-storage-check";

export default defineEventHandler(async (event) => {
  const { key, body } = getQuery(event);
  const s3 = useS3();

  await s3
    .send(new HeadBucketCommand({ Bucket: bucket }))
    .catch(() => s3.send(new CreateBucketCommand({ Bucket: bucket })));

  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: String(key), Body: String(body) }),
  );

  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: String(key) }),
  );

  return {
    sameInstance: useS3() === s3,
    body: await object.Body?.transformToString(),
  };
});
