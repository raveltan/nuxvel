import {
  CreateBucketCommand,
  GetBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
  type LifecycleRule,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { fail } from "../ui/fail.ts";

const TEMP_UPLOADS_RULE_ID = "expire-temp-uploads";

export function requiredEnv(name: string) {
  const value = process.env[name];

  return value || fail(`${name} is not set`, { hint: `Add ${name} to .env or the shell` });
}

export function s3Client(storageUrl: string) {
  const url = new URL(storageUrl);

  return new S3Client({
    endpoint: url.origin,
    region: "us-east-1",
    forcePathStyle: true,
    // otherwise presigned PUT URLs carry an empty-body CRC32 no real upload matches
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: decodeURIComponent(url.username),
      secretAccessKey: decodeURIComponent(url.password),
    },
  });
}

function isMissing(error: unknown, code: string) {
  return (
    error instanceof S3ServiceException &&
    (error.name === code || error.name === "NotFound" || error.$metadata.httpStatusCode === 404)
  );
}

async function ensureBucket(s3: S3Client, bucket: string) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return false;
  } catch (error) {
    if (!isMissing(error, "NoSuchBucket")) throw error;
  }

  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  return true;
}

async function lifecycleRules(s3: S3Client, bucket: string): Promise<LifecycleRule[]> {
  try {
    const { Rules } = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
    return Rules ?? [];
  } catch (error) {
    if (isMissing(error, "NoSuchLifecycleConfiguration")) return [];
    throw error;
  }
}

export async function setupStorage() {
  const bucket = requiredEnv("NUXT_STORAGE_BUCKET");
  const s3 = s3Client(requiredEnv("NUXT_STORAGE_URL"));

  try {
    const created = await ensureBucket(s3, bucket);
    const existing = await lifecycleRules(s3, bucket);

    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [
            ...existing.filter((rule) => rule.ID !== TEMP_UPLOADS_RULE_ID),
            {
              ID: TEMP_UPLOADS_RULE_ID,
              Status: "Enabled",
              Filter: { Prefix: "tmp/" },
              Expiration: { Days: 1 },
            },
          ],
        },
      }),
    );

    return { bucket, created };
  } finally {
    s3.destroy();
  }
}
