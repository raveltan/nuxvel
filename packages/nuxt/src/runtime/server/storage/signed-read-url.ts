import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AUDIT_EXPORT_PREFIX, isUnder } from "../audit/audit-export";
import { useBucket } from "./bucket";
import { useS3 } from "./client";
import { useSigningS3 } from "./signing-client";

const READ_URL_EXPIRES_IN_SECONDS = 600;

function isInline(type: string) {
  const [kind] = type.split("/");

  return (kind === "image" && type !== "image/svg+xml") || kind === "audio" || kind === "video" || type === "application/pdf";
}

/**
 * A presigned URL that reads the file at `key` in {@link useBucket},
 * valid for 10 minutes.
 *
 * Auto-imported on the server. Use it to show a stored file, such as one
 * {@link promoteUpload} moved, in an `<img>` or a download link without
 * making the bucket public. Sign it when the page asks for it rather than
 * storing it: the URL expires, the key does not.
 *
 * Only raster images, PDF, audio and video open in the browser. Every
 * other type, SVG and HTML included, is served with
 * `Content-Disposition: attachment`, so the browser downloads it instead
 * of rendering it. The type is read from storage, so each call makes one
 * `HEAD` request. The file answers with `Cache-Control: private`, so a
 * CDN or proxy does not keep it. A key with no file still gets a URL, which answers
 * `404`. With `NUXT_STORAGE_PUBLIC_URL` set, the URL points at that
 * host instead of `NUXT_STORAGE_URL`.
 *
 * @example
 * ```ts
 * return { coverUrl: post.coverKey ? await signedReadUrl(post.coverKey) : null };
 * ```
 *
 * Pass only a key that your server code stored, never one from the
 * request or from `user.image`. It throws for a key under
 * `backups/audit/`, where the audit log archives are.
 */
export async function signedReadUrl(key: string): Promise<string> {
  if (isUnder(AUDIT_EXPORT_PREFIX, key)) {
    throw new Error(`signedReadUrl() does not sign audit archives (${AUDIT_EXPORT_PREFIX})`);
  }

  const bucket = useBucket();
  const head = await useS3()
    .send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    .catch(() => undefined);
  const disposition = isInline(head?.ContentType ?? "") ? undefined : "attachment";

  return getSignedUrl(
    useSigningS3(),
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseCacheControl: "private", ResponseContentDisposition: disposition }),
    { expiresIn: READ_URL_EXPIRES_IN_SECONDS },
  );
}
