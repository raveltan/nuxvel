import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { onCommit } from "../database/transaction";
import { useBucket } from "./bucket";
import { useS3 } from "./client";

const S3_DELETE_LIMIT = 1000;

/**
 * Deletes files from {@link useBucket} once the surrounding transaction
 * commits, such as the files of rows that the transaction deletes.
 *
 * Auto-imported on the server. On a rollback it deletes nothing, so the
 * rows and their files stay together. Outside a transaction it deletes
 * the files at once. A key with no stored file is not an error.
 *
 * @example
 * ```ts
 * const files = await useDb().select({ key: attachmentTable.key }).from(attachmentTable).where(inArray(attachmentTable.ticketId, ids));
 * await forceDelete(ticketTable, inArray(ticketTable.id, ids));
 * await deleteStoredFiles(files.map(({ key }) => key));
 * ```
 */
export function deleteStoredFiles(keys: readonly string[]): Promise<void> {
  return onCommit(async () => {
    for (let start = 0; start < keys.length; start += S3_DELETE_LIMIT) {
      const objects = keys.slice(start, start + S3_DELETE_LIMIT).map((Key) => ({ Key }));

      await useS3().send(new DeleteObjectsCommand({ Bucket: useBucket(), Delete: { Objects: objects, Quiet: true } }));
    }
  });
}
