import { TRPCError } from "@trpc/server";
import { getRequestHeader } from "h3";
import { currentEvent } from "../utils/current-event";
import { actorContext } from "../actions/context";
import type { Actor } from "../actions/system-actor";
import { userActor } from "../actions/user-actor";
import { requestApiKey } from "../auth/api-keys";
import { classifyError } from "../errors/classify";
import { ForbiddenError } from "../errors/forbidden-error";
import { UnauthenticatedError } from "../errors/unauthenticated-error";
import { isObserved, publishObserved } from "../observe/channels";
import { signedInTooLongAgo } from "../auth/fresh-sign-in";
import { auth, type SessionUser } from "../utils/auth";
import { requestCaller } from "../utils/use-auth";
import { failureDetails } from "./failure-details";
import { collectInvalidated } from "../actions/invalidation-scope";
import { currentLocale } from "../i18n/current-locale";
import { type TRPCContext, t } from "./trpc";

function isSameOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function crossSiteRequest() {
  const event = currentEvent();
  const site = event && getRequestHeader(event, "sec-fetch-site");

  return site === "cross-site" || site === "same-site";
}

async function signedIn(ctx: TRPCContext): Promise<{ user: SessionUser; actor: Actor } | null> {
  if (ctx.user) return { user: ctx.user, actor: userActor(ctx.user) };

  return requestCaller();
}

const baseProcedure = t.procedure
  .use(({ ctx, next }) => next({ ctx: { locale: ctx.locale ?? currentLocale() } }))
  .use(async ({ path, type, next }) => {
    if (!isObserved("trpc:call")) return next();

    const startedAt = performance.now();
    const result = await next();

    publishObserved("trpc:call", {
      path,
      type,
      durationMs: performance.now() - startedAt,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error.code, ...failureDetails(result.error) }),
    });

    return result;
  })
  .use(async ({ next }) => {
    const result = await next();
    const classified = result.ok ? undefined : classifyError(result.error);

    if (classified) throw classified;

    return result;
  })
  .use(({ ctx, type, next }) => {
    if (type === "mutation" && (!isSameOrigin(ctx.origin, ctx.host) || crossSiteRequest()) && !requestApiKey()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cross-origin mutation rejected",
      });
    }

    return next();
  })
  .use(({ type, next }) => (type === "mutation" ? collectInvalidated(currentEvent(), () => next()) : next()));

/**
 * Base procedure for endpoints that do not require a session.
 *
 * Rejects mutations whose `Origin` header does not match the request
 * host — the first `X-Forwarded-Host` behind a proxy, else `Host` — with
 * `FORBIDDEN`, unless the request sends an API key: a browser cannot add
 * an `Authorization` header cross-origin without a CORS preflight. It
 * also rejects a mutation when the browser marks the request
 * `Sec-Fetch-Site: cross-site` or `same-site`, which covers a link or a
 * redirect from another site that sends no `Origin`. A unique-constraint violation it lets escape answers as
 * {@link ConflictError}, a foreign key violation as
 * {@link ValidationFailedError} or {@link ConflictError}, and a
 * deadlock, serialization failure, lock timeout or lost connection as
 * {@link TransientError}.
 *
 * Resolves the caller the same way {@link authedProcedure} does, but
 * lets a signed-out call through:
 *
 * - `ctx.user` — the {@link SessionUser}, or `null` when signed out.
 * - `ctx.actor` — that user as an {@link Actor}, or `null`.
 *
 * An API key signs the call in as its owner. An unknown, revoked or
 * expired key throws `UNAUTHORIZED`. A call from outside a request, such
 * as `useCaller()` in a job, sees `null`. The procedure body runs with
 * this caller as the ambient one: {@link useAuth} returns it, and an
 * action called without `ctx` runs as `ctx.actor`.
 *
 * @example
 * ```ts
 * export const postRouter = {
 *   greeting: publicProcedure.query(({ ctx }) =>
 *     ctx.user ? `Hello, ${ctx.user.name}` : "Hello, guest",
 *   ),
 * };
 * ```
 */
export const publicProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const caller = await signedIn(ctx);
  const run = () => next({ ctx: { user: caller?.user ?? null, actor: caller?.actor ?? null } });

  return caller ? actorContext.run(caller.actor, run) : run();
});

/**
 * Procedure that requires a signed-in user, throwing `UNAUTHORIZED`
 * otherwise. Everything {@link publicProcedure} does, plus:
 *
 * - `ctx.user` — the {@link SessionUser}, `role` included.
 * - `ctx.actor` — that user as an {@link Actor}, ready to hand to an
 *   action or to {@link can} / {@link authorize}.
 *
 * A request with `Authorization: Bearer nxk_…` is signed in with that
 * API key instead of the session cookie: `ctx.user` is the key's owner
 * and `ctx.actor` the {@link apiKeyActor}. An unknown, revoked or expired
 * key throws `UNAUTHORIZED`; each call spends the key's `api-key` rate
 * limit.
 *
 * @example
 * ```ts
 * export const postRouter = {
 *   mine: authedProcedure.query(({ ctx }) =>
 *     useDb().select().from(postsTable).where(eq(postsTable.authorId, ctx.user.id)),
 *   ),
 *   create: authedProcedure
 *     .input(createPostInput)
 *     .mutation(({ input, ctx }) => createPostAction(input, { actor: ctx.actor })),
 * };
 * ```
 */
export const authedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const caller = await signedIn(ctx);

  if (!caller) throw new UnauthenticatedError();

  return actorContext.run(caller.actor, () => next({ ctx: caller }));
});

/**
 * Builds a procedure for signed-in users with one of `roles`.
 * Everything {@link authedProcedure} does, then it throws `FORBIDDEN` (a
 * {@link ForbiddenError}) when the `role` of the user is not in `roles`.
 * It also throws `FORBIDDEN` for a call with an API key, unless
 * `apiKeys` is `true`. The key of a user has the role of that user, so
 * without this check a leaked key opens every procedure of its owner.
 * The check runs before `.input()`, so {@link expectRefused} can call each
 * procedure with no input. Auto-imported. For admin tools that need a
 * second factor, use {@link adminProcedure}.
 *
 * @param roles - The roles that may call the procedure.
 * @param options.apiKeys - Accept a call with an API key of a user with one of `roles`. Default `false`.
 *
 * @example
 * ```ts
 * const agentProcedure = roleProcedure(["admin", "agent"]);
 *
 * export const ticketRouter = {
 *   list: agentProcedure.query(() => useDb().select().from(ticketTable)),
 *   assign: agentProcedure
 *     .input(assignTicketInput)
 *     .mutation(({ input, ctx }) => assignTicketAction(input, { actor: ctx.actor })),
 * };
 * ```
 */
export function roleProcedure(roles: readonly string[], options: { apiKeys?: boolean } = {}) {
  return authedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) throw new ForbiddenError(`Only a user with the role ${roles.join(" or ")} may do this`);
    if (!options.apiKeys && requestApiKey()) throw new ForbiddenError("An API key cannot call this procedure");

    return next();
  });
}

/**
 * Procedure for admin tools: a signed-in user with the `admin` role whose
 * session passed a second factor. Everything {@link roleProcedure}
 * `(["admin"])` does, so it throws `FORBIDDEN` (a {@link ForbiddenError})
 * for any other role and for a call with an API key. It also throws
 * `FORBIDDEN` for a session without
 * `twoFactorVerified`. Only a session that starts from a valid TOTP,
 * backup code or OTP has it, so a social sign-in of a user without
 * two-factor sign-in, or a session from before two-factor sign-in was turned on, does not. An {@link actingAs}
 * caller counts as verified when the user has two-factor sign-in on. The
 * role is the `role` column of the user, which sign-up cannot set.
 *
 * @example
 * ```ts
 * export const adminRouter = {
 *   recentUsers: adminProcedure.query(() =>
 *     useDb().select().from(userTable).orderBy(desc(userTable.createdAt)).limit(50),
 *   ),
 * };
 * ```
 */
export const adminProcedure = roleProcedure(["admin"]).use(async ({ ctx, next }) => {
  const session = await auth();
  const verified = session ? session.session.twoFactorVerified : ctx.user.twoFactorEnabled;

  if (!verified) throw new ForbiddenError("Sign in with a second factor to use admin tools");

  return next();
});

/**
 * Procedure that requires a sign-in in the last 10 minutes, for sensitive
 * changes such as a new email, a new password or deleting the account.
 * Everything {@link authedProcedure} does, then it throws `FORBIDDEN` (a
 * {@link ForbiddenError}) when the session was created more than 10
 * minutes ago by `now()`, and for a call with an API key. Ask the user
 * to sign in again, then retry. An `actingAs()` caller counts as a
 * fresh sign-in.
 *
 * @example
 * ```ts
 * export const accountRouter = {
 *   changeEmail: freshProcedure
 *     .input(changeEmailSchema)
 *     .mutation(({ input, ctx }) => changeEmailAction(input, { actor: ctx.actor })),
 * };
 * ```
 */
export const freshProcedure = authedProcedure.use(async ({ next }) => {
  const session = await auth();
  const stale = requestApiKey() || (session !== null && signedInTooLongAgo(session.session.createdAt));

  if (stale) throw new ForbiddenError("Sign in again to continue");

  return next();
});
