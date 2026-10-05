import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer, supportedMimeTypes } from "file-type";
import { z } from "zod";
import { AUDIT_EXPORT_PREFIX, isUnder } from "../audit/audit-export";
import { onRollback } from "../database/transaction";
import { ValidationFailedError } from "../errors/taxonomy";
import { useAuth } from "../utils/use-auth";
import { useBucket } from "./bucket";
import { useS3 } from "./client";
import { SVG_LIMITS_MESSAGE, convertSvg } from "./convert-svg";
import type { Upload } from "./define-upload";
import { type UploadName, findUpload } from "./registry";

const SNIFF_BYTES = 4100;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function uploadKeySchema(upload: string) {
  return z.object({
    key: z.string().regex(new RegExp(`^tmp/${upload}/([^/]+/)?${UUID}$`), `Must be a ${upload} upload key`),
  });
}

function keyError(key: string, message: string) {
  return new ValidationFailedError(new z.ZodError([{ code: "custom", path: ["key"], message, input: key }]));
}

async function refuse(bucket: string, key: string, message: string): Promise<never> {
  await useS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  throw keyError(key, message);
}

function unchanged<T>(key: string, sending: Promise<T>) {
  return sending.catch((error: unknown) => {
    throw error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412
      ? keyError(key, "The file changed after the check. Upload it again")
      : error;
  });
}

async function firstBytes(bucket: string, key: string, etag: string | undefined) {
  const object = await unchanged(
    key,
    useS3().send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag, Range: `bytes=0-${SNIFF_BYTES - 1}` })),
  );

  return (await object.Body?.transformToByteArray()) ?? new Uint8Array();
}

async function checkedType(bucket: string, key: string, upload: Upload | undefined) {
  const head = await useS3()
    .send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    .catch((error: unknown) => {
      throw error instanceof NotFound ? keyError(key, "The file is not in storage. Upload it again") : error;
    });
  const size = head.ContentLength ?? 0;
  const type = head.ContentType ?? "";

  if (upload && size > upload.maxSize) return refuse(bucket, key, `The file is larger than ${upload.maxSize} bytes`);

  const sniffed = size > 0 ? await fileTypeFromBuffer(await firstBytes(bucket, key, head.ETag)) : undefined;
  const matches = sniffed ? sniffed.mime === type : !supportedMimeTypes.has(type);

  if (!matches) return refuse(bucket, key, `The file's content is not ${type}`);

  return { type, etag: head.ETag };
}

/** Which uploaded file {@link checkUpload} checks. */
export interface CheckUploadOptions {
  upload: UploadName;
  key: string;
}

/**
 * Checks an uploaded file in `tmp/` as {@link promoteUpload} does, but
 * does not move it.
 *
 * Auto-imported on the server. Use it when a form sends more than one
 * file: check every file first, then promote them. Then a refused file
 * does not leave the files before it already moved out of `tmp/`.
 * It throws the same {@link ValidationFailedError} on `key` as
 * `promoteUpload()`, and deletes a file that fails a check.
 *
 * @param options.upload The upload's name, as in {@link defineUpload}.
 * @param options.key The key `POST /api/uploads/<name>` returned.
 *
 * @example
 * ```ts
 * for (const file of input.files) await checkUpload({ upload: "attachment", key: file.key });
 * for (const file of input.files) await promoteUpload({ upload: "attachment", key: file.key, to: `files/${randomUUID()}` });
 * ```
 */
export async function checkUpload({ upload, key }: CheckUploadOptions): Promise<void> {
  await checkedUpload(upload, key);
}

async function checkedUpload(upload: UploadName, key: string) {
  const result = uploadKeySchema(upload).safeParse({ key });

  if (!result.success) throw new ValidationFailedError(result.error);

  const owner = key.split("/").length === 4 ? key.split("/")[2] : undefined;

  if (owner !== undefined && owner !== (await useAuth()).user?.id) throw keyError(key, "Another user uploaded this file");

  const definition = findUpload(upload);

  return { definition, ...(await checkedType(useBucket(), key, definition)) };
}

/** Where {@link promoteUpload} moves a file from, and to. */
export interface PromoteUploadOptions {
  upload: UploadName;
  key: string;
  to: string;
}

/**
 * Moves an uploaded file out of `tmp/`, where it expires after a day, to
 * a permanent key in {@link useBucket}, and returns that key.
 *
 * Auto-imported on the server. Call it once the browser reports a
 * finished upload, and store the returned key — never the `tmp/` one.
 * The key comes from the browser, so it must be exactly
 * `tmp/<upload>/<user id>/<uuid>` (or `tmp/<upload>/<uuid>` for a guest)
 * as issued for that upload; anything else, such as a `..` path, throws
 * {@link ValidationFailedError} on `key` before storage is touched. So
 * does the key of a signed-in user when the caller of {@link useAuth} is
 * a different user. Any caller can promote the key of a guest.
 *
 * Before it moves anything, it checks the stored file: its size must be
 * within the upload's `maxSize`, and its first bytes must match its
 * declared type (a PNG must start like a PNG). A type that has no
 * signature, such as `text/plain` or `image/svg+xml`, passes when the
 * bytes match no known binary type. A file that fails is deleted, and
 * {@link ValidationFailedError} is thrown on `key`. A key with no stored
 * file, such as a file it refused before or one that expired, throws the
 * same error. It moves only the bytes that it checked: a file that the
 * browser sends again after the check throws the same error. To check several files before moving any, see
 * {@link checkUpload}.
 *
 * An SVG file of an upload whose `svg` option is `"sanitize"` is stored
 * at `to` as an SVG with only drawing elements left. One whose `svg` is
 * `"rasterize"` is sanitized the same way, without `stroke-dasharray`,
 * and stored at `to` as a PNG (`image/png`). An SVG over 256 KB, with
 * more than 1000 elements, or over 4 000 000 pixels when rasterized, is
 * deleted, and {@link ValidationFailedError} is thrown on `key`. See
 * {@link defineUpload}.
 *
 * Inside a transaction, such as an action, a rollback deletes the file
 * at `to` again, so a failed write leaves no file without its row.
 *
 * @param options.upload The upload's name, as in {@link defineUpload}.
 * @param options.key The key `POST /api/uploads/<name>` returned.
 * @param options.to The permanent key to move the file to. It throws for
 * a key under `tmp/`, where the file expires, or under `backups/audit/`,
 * where the audit log archives are.
 *
 * @example
 * ```ts
 * const avatarKey = await promoteUpload({
 *   upload: "avatar",
 *   key: input.key,
 *   to: `avatars/${ctx.actor.id}/${randomUUID()}`,
 * });
 * ```
 */
export async function promoteUpload({ upload, key, to }: PromoteUploadOptions): Promise<string> {
  if (isUnder("tmp/", to) || isUnder(AUDIT_EXPORT_PREFIX, to)) {
    throw new Error(`promoteUpload() does not move a file to ${to}: tmp/ expires and ${AUDIT_EXPORT_PREFIX} holds the audit log`);
  }

  const { definition, type, etag } = await checkedUpload(upload, key);
  const bucket = useBucket();
  const svg = definition?.svg ?? "reject";

  if (svg !== "reject" && type === "image/svg+xml") {
    const object = await unchanged(key, useS3().send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag })));
    const bytes = await object.Body?.transformToByteArray();

    if (!bytes) throw new Error(`Upload ${key} has no content`);

    const converted = (await convertSvg(bytes, svg)) ?? (await refuse(bucket, key, SVG_LIMITS_MESSAGE));

    await useS3().send(new PutObjectCommand({ Bucket: bucket, Key: to, Body: converted.body, ContentType: converted.contentType }));
  } else {
    await unchanged(
      key,
      useS3().send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${key}`, CopySourceIfMatch: etag, Key: to })),
    );
  }

  onRollback(() => useS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: to })).then(() => undefined));
  await useS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  return to;
}
