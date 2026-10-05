import { createHmac } from "node:crypto";
import type { H3Event } from "h3";
import { ForbiddenError } from "../errors/forbidden-error";
import { now } from "../clock/now";
import { sameText } from "./same-text";
import { useSecrets } from "./secrets";

const SECRET = "NUXT_AUTH_SECRET";
const BASE = "http://signed.invalid";

function digest(secret: string, signedPart: string) {
  return createHmac("sha256", secret).update(signedPart).digest("hex");
}

/**
 * A copy of `path` that expires, signed with `NUXT_AUTH_SECRET`.
 *
 * Auto-imported on the server. Use it for invite, unsubscribe and
 * "approve from email" links. The function adds the `expires` and
 * `signature` query parameters. The signature covers the path, every
 * query parameter and the expiry time. The route that receives the link
 * calls {@link requireSignature}.
 *
 * The result is a path. Put your origin in front of it for a link in an
 * email.
 *
 * @param path The path to sign, with its query, e.g. `/invites/42?team=7`.
 * @param options.expiresIn The number of seconds that the link stays valid.
 *
 * @example
 * ```ts
 * const link = `${origin}${signedUrl(`/invites/${invite.id}`, { expiresIn: 7 * 24 * 60 * 60 })}`;
 * ```
 */
export function signedUrl(path: string, options: { expiresIn: number }): string {
  const url = new URL(path, BASE);
  url.searchParams.delete("signature");
  url.searchParams.set("expires", String(Math.floor(now().getTime() / 1000) + options.expiresIn));

  const signedPart = url.pathname + url.search;

  return `${signedPart}&signature=${digest(useSecrets(SECRET)[0], signedPart)}`;
}

/**
 * Checks that the request URL, or a path, is a link from
 * {@link signedUrl} that did not expire.
 *
 * Auto-imported on the server. Call it first in the route that receives
 * the link. Pass the path itself when the link opens a page and a
 * procedure checks it, e.g. `/requests/42?expires=...&signature=...`.
 * It accepts a signature from the current `NUXT_AUTH_SECRET`. During a
 * rotation grace period, it also accepts a signature from the
 * previous value (see {@link useSecrets}).
 *
 * Throws a {@link ForbiddenError} (HTTP 403, tRPC `FORBIDDEN`) when the
 * signature is missing or wrong, when a part of the URL changed, when the
 * path has `\`, `.` or `..` segments or `%2e` (the route must receive the
 * path that the signature covers), or when the link expired.
 *
 * @param target The request, or a path with its query.
 *
 * @example
 * ```ts
 * export default defineEventHandler((event) => {
 *   requireSignature(event);
 *   return acceptInvite(getRouterParam(event, "id"));
 * });
 * ```
 */
export function requireSignature(target: H3Event | string): void {
  const raw = typeof target === "string" ? target : target.path;
  const url = new URL(raw, BASE);
  const signature = url.searchParams.get("signature") ?? "";
  url.searchParams.delete("signature");

  const signedPart = url.pathname + url.search;
  const valid = useSecrets(SECRET).some((secret) => sameText(digest(secret, signedPart), signature));

  if (!valid || raw.split("?")[0] !== url.pathname) throw new ForbiddenError("Invalid signature");

  if (Number(url.searchParams.get("expires")) <= now().getTime() / 1000) {
    throw new ForbiddenError("This link expired");
  }
}
