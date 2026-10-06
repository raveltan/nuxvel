import { awaitingName } from "../discovery/definition-name";
import type { RateLimitOptions } from "../security/point-of-use";
import type { SessionUser } from "../utils/auth";
import { defaultAuthorize } from "../security/default-authorize";

const DEFAULT_RATE_LIMIT: RateLimitOptions = { points: 30, window: { minutes: 1 }, by: "ip" };

const SIZE_UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };

/**
 * A file size for {@link defineUpload}'s `maxSize`: bytes, or an amount
 * and a unit, such as `"500 KB"` or `"2 MB"`. A unit is a power of
 * 1024, as in most upload limits: `"1 KB"` is 1024 bytes.
 */
export type FileSize = number | `${number} ${"B" | "KB" | "MB" | "GB"}`;

function sizeInBytes(size: FileSize) {
  const [, amount, unit] = typeof size === "number" ? [] : (/^(\d+(?:\.\d+)?) (B|KB|MB|GB)$/.exec(size) ?? []);
  const bytes = typeof size === "number" ? size : Math.floor(Number(amount) * (SIZE_UNITS[unit ?? ""] ?? Number.NaN));

  if (!Number.isFinite(bytes) || bytes < 1) {
    throw new Error(`nuxvel: maxSize must be at least 1 byte, as bytes or a size such as "2 MB", got ${typeof size === "number" ? size : JSON.stringify(size)}`);
  }

  return bytes;
}

/** What an upload's `authorize` sees: the user asking for a URL, or `null` when signed out. */
export interface UploadRequest {
  user: SessionUser | null;
}

/**
 * What {@link promoteUpload} does with an SVG file: `"reject"` refuses
 * `image/svg+xml` when the browser asks for an upload URL,
 * `"rasterize"` removes the same content as `"sanitize"` and then
 * converts the file to a PNG, and `"sanitize"` keeps the
 * SVG without scripts, event handlers, links or `<foreignObject>`.
 * {@link promoteUpload} refuses an SVG over 256 KB or with more than
 * 1000 elements.
 */
export type SvgHandling = "reject" | "rasterize" | "sanitize";

/**
 * An upload definition: its name, who may upload, and the limits every
 * file sent to it must meet. The name is its file's path under
 * `server/uploads/`.
 */
export interface Upload<Name extends string = string> {
  readonly name: Name;
  maxSize: number;
  allowedTypes: readonly string[];
  svg: SvgHandling;
  authorize: (request: UploadRequest) => boolean | Promise<boolean>;
  rateLimit: RateLimitOptions;
}

/**
 * What `POST /api/uploads/<name>` returns for an accepted request: a
 * presigned URL to `PUT` the file to, the key it lands under, and the
 * headers the `PUT` must send.
 */
export interface PresignedUpload {
  url: string;
  key: string;
  headers: { "content-type": string };
}

/**
 * Defines an upload: a named kind of file the browser sends straight to
 * storage, with the limits it must meet.
 *
 * `defineUpload` is auto-imported. One upload per file, under
 * `server/uploads/`; the file is discovered, so nothing registers it, and
 * its path is the upload's name, the last segment of its URL
 * (`server/uploads/profile/avatar.upload.ts` is `"profile.avatar"`). The name is
 * part of {@link UploadName}, so `$fetch("/api/uploads/<name>", { method:
 * "POST" })` resolves to a {@link PresignedUpload} with no type argument.
 *
 * The browser asks for a URL with `POST /api/uploads/<name>` and a JSON
 * body `{ type, size }` — the file's MIME type and byte length.
 * The rate limit runs first; a request over it is answered `429`. Then
 * `authorize` runs; a request it refuses is answered `403`. A
 * request over `maxSize` or outside `allowedTypes` is answered `400`, as
 * a {@link ValidationFailedError}, with a {@link ValidationError} as its
 * `data` and no URL. An accepted one gets a
 * {@link PresignedUpload}: a URL signed for exactly that `Content-Length`
 * and `Content-Type`, so storage itself rejects a `PUT` whose file does
 * not match what was declared. Files land under `tmp/<name>/<user id>/`
 * (`tmp/<name>/` for a guest) in the `NUXT_STORAGE_BUCKET` bucket.
 *
 * @param config.maxSize Largest accepted file: bytes, or a
 * {@link FileSize} such as `"2 MB"`. A size that is not a number of at
 * least 1 byte throws when the upload is defined.
 * @param config.allowedTypes Accepted MIME types, matched exactly.
 * @param config.authorize Whether this request may get an upload URL.
 * Gets the signed-in `user`, or `null` for a guest. Defaults to signed-in
 * users only.
 * @param config.public `true` gives every request an upload URL, guests
 * included, when `authorize` is left out.
 * @param config.rateLimit The limit on the requests for an upload URL, as
 * in `rateLimit()`, counted under `upload/<name>`. Defaults to 30
 * requests per minute for each IP.
 * @param config.svg What happens to an `image/svg+xml` file listed in
 * `allowedTypes`, see {@link SvgHandling}. Defaults to `"reject"`, which
 * answers a request for an SVG `400`. `"rasterize"` and `"sanitize"` take
 * effect in {@link promoteUpload}; until then the file stays in `tmp/`.
 *
 * @example
 * ```ts
 * // server/uploads/avatar.upload.ts
 * export const avatarUpload = defineUpload({
 *   maxSize: "2 MB",
 *   allowedTypes: ["image/png", "image/jpeg"],
 * });
 * ```
 */
export function defineUpload(
  config: Omit<Upload, "name" | "svg" | "rateLimit" | "authorize" | "maxSize"> &
    Partial<Pick<Upload, "svg" | "rateLimit" | "authorize">> & { maxSize: FileSize; public?: boolean },
): Upload {
  return awaitingName(
    {
      name: "",
      ...config,
      maxSize: sizeInBytes(config.maxSize),
      authorize: config.authorize ?? defaultAuthorize(config.public),
      svg: config.svg ?? "reject",
      rateLimit: config.rateLimit ?? DEFAULT_RATE_LIMIT,
    },
    "upload",
  );
}
