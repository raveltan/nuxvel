import { reportUnexpectedError } from "./report-unexpected-error";
import { type AppRouter, appRouter } from "./router";

/**
 * An in-process caller for the app router: no HTTP, no network.
 *
 * Auto-imported on the server. Procedures are called directly, tRPC v11
 * style — `useCaller().post.list()`, not `.query()`. It carries no user
 * of its own: an {@link authedProcedure} reached through it resolves the
 * session of the request it is called in: inside a signed-in request it
 * runs as that user, in a signed-out one it throws `UNAUTHORIZED`, and a
 * job or a task has no session at all — call the action with a
 * `systemActor(...)` there instead. Inside a request that the browser
 * marks `Sec-Fetch-Site: cross-site` or `same-site`, a mutation reached
 * through it throws `FORBIDDEN`. To change state from a link, call the
 * action directly behind a signed URL with `requireSignature`.
 *
 * @example
 * ```ts
 * const posts = await useCaller().post.list();
 * ```
 */
export function useCaller(): ReturnType<AppRouter["createCaller"]> {
  return appRouter.createCaller({}, { onError: reportUnexpectedError });
}
