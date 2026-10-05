import { callApp } from "./settled";

/**
 * Signs a path in the app under test, like the server's {@link signedUrl},
 * so a test can open a link that the app accepts.
 *
 * The app signs the path with its `NUXT_AUTH_SECRET`. The expiry uses the
 * clock of the app, so {@link travelBy} past `expiresIn` expires the link.
 * The result is a path. Open it with `fetch` or {@link visit}.
 *
 * @param path The path to sign, with its query, e.g. `/api/invites/42/accept`.
 * @param options.expiresIn The number of seconds that the link stays valid.
 *
 * @example
 * ```ts
 * const link = await signedUrl(`/api/invites/${invite.id}/accept`, { expiresIn: 60 });
 * expect((await guest().fetch(link)).status).toBe(200);
 * ```
 */
export async function signedUrl(path: string, options: { expiresIn: number }): Promise<string> {
  const url = await callApp("signed-url", { path, expiresIn: options.expiresIn });
  if (typeof url !== "string") throw new Error("signedUrl: the app did not return a path");

  return url;
}
