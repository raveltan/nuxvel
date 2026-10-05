import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import type { SessionUser } from "../utils/auth";
import { errorFormatter } from "./error-formatter";

/**
 * What a caller hands to every procedure.
 *
 * HTTP requests fill `origin`, `host` and `clientBuildId`, the build
 * the browser's app came from. `locale` overrides the locale of the
 * call. Without it, {@link publicProcedure} and {@link authedProcedure}
 * set `ctx.locale` to {@link currentLocale}. `user` is set only
 * by an in-process caller acting as someone (the `actingAs` test
 * fixture). {@link authedProcedure} and {@link publicProcedure} otherwise
 * resolve the user from the session cookie or an API key.
 */
export interface TRPCContext {
  origin?: string;
  host?: string;
  clientBuildId?: string;
  locale?: string;
  user?: SessionUser;
}

/**
 * The initialized tRPC instance: superjson on the wire, taxonomy-aware
 * error formatting, and `.meta({ openapi })` to expose a procedure over
 * REST.
 *
 * Use `t.router` to build a router; prefer {@link publicProcedure} and
 * {@link authedProcedure} over `t.procedure` so origin, auth and
 * error-reporting handling stay in place.
 */
export const t = initTRPC.meta<OpenApiMeta>().context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter,
  // tRPC's isDev only adds the stack to the error shape, which no response sends, in development too
  isDev: false,
});
