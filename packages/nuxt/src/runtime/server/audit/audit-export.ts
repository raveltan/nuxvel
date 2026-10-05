import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export type ArchivePartition = (partition: string, gzippedJsonl: Buffer) => Promise<void>;

export const AUDIT_EXPORT_PREFIX = "backups/audit/";

export function isUnder(prefix: string, key: string) {
  return key.split("/").filter(Boolean).join("/").startsWith(prefix);
}

function auditExportKey(partition: string) {
  return `${AUDIT_EXPORT_PREFIX}${partition}.jsonl.gz`;
}

export function archiveTo(client: () => S3Client, bucket: () => string): ArchivePartition {
  return async (partition, gzippedJsonl) => {
    await client().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: auditExportKey(partition),
        Body: gzippedJsonl,
        ContentType: "application/gzip",
      }),
    );
  };
}
