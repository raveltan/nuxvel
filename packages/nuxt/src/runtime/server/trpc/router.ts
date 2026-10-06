import discoveredRouters from "#nuxvel/trpc-routers";
import { apiKeysRouter } from "../auth/api-keys-router";
import { localizeInputs } from "./localize-inputs";
import { resolveOpenapi } from "./procedure-methods";
import { t } from "./trpc";

type Routers = Omit<{ apiKeys: typeof apiKeysRouter }, keyof typeof discoveredRouters> & typeof discoveredRouters;

/**
 * The app router, assembled from every file under
 * `server/trpc/routers/`. Folder and file names become the nested
 * procedure path; nothing is registered by hand. The built-in `apiKeys`
 * router lists, creates and revokes the signed-in user's API keys; an
 * app router named `apiKeys` hides it. A Zod `.input()` schema gives
 * its messages in the locale of the call (`ctx.locale`).
 */
export const appRouter: AppRouter = localizeInputs(resolveOpenapi(t.router<Routers>({ apiKeys: apiKeysRouter, ...discoveredRouters })));

/** Type of {@link appRouter}; what the client is typed against. */
export type AppRouter = ReturnType<typeof t.router<Routers>>;
