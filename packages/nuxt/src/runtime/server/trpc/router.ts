import discoveredRouters from "#nuxvel/trpc-routers";
import { apiKeysRouter } from "../auth/api-keys-router";
import { localizeInputs } from "./localize-inputs";
import { resolveOpenapi } from "./procedure-methods";
import { t } from "./trpc";

type Routers = Omit<{ apiKeys: typeof apiKeysRouter }, keyof typeof discoveredRouters> & typeof discoveredRouters;

let router: AppRouter | undefined;

/**
 * The app router, assembled from every file under
 * `server/trpc/routers/` the first time it is read. Folder and file
 * names become the nested procedure path; nothing is registered by
 * hand. The built-in `apiKeys` router lists, creates and revokes the
 * signed-in user's API keys; an app router named `apiKeys` hides it. A
 * Zod `.input()` schema gives its messages in the locale of the call
 * (`ctx.locale`).
 */
export function appRouter(): AppRouter {
  router ??= localizeInputs(resolveOpenapi(t.router<Routers>({ apiKeys: apiKeysRouter, ...discoveredRouters })));

  return router;
}

/** Type of {@link appRouter}; what the client is typed against. */
export type AppRouter = ReturnType<typeof t.router<Routers>>;
