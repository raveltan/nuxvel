import type { z } from "zod";
import { cacheForget } from "../cache/cache";
import { onCommit, transaction } from "../database/transaction";
import { classifyError } from "../errors/classify";
import { awaitingName } from "../discovery/definition-name";
import { ValidationFailedError } from "../errors/taxonomy";
import { ActionError } from "./action-error";
import { type ActionRateLimit, actionRateLimiter } from "./action-rate-limit";
import { actorContext } from "./context";
import { localeScope, currentLocale } from "../i18n/current-locale";
import { zodLocaleError } from "../i18n/zod-locale-error";
import type { Actor } from "./system-actor";
import { logActionCall } from "./trace";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }

  return String(error);
}

/**
 * Second argument every action receives: who performs it, and in which
 * locale. A caller can leave out `locale`. The handler then gets
 * {@link currentLocale}, which is the locale of the calling action or
 * of the request, and the default locale in a job.
 */
export interface ActionContext {
  actor: Actor;
  locale?: string;
}

/**
 * Third argument an action handler receives. Calling it throws an
 * {@link ActionError} with `code` as its `actionCode` and never returns,
 * so it can be used in an expression position.
 */
export type Fail<Errors extends Record<string, string>> = (
  code: keyof Errors & string,
  message?: string,
) => never;

/**
 * An action from {@link defineAction}: call it with the schema's input
 * and an actor. Without `ctx` it runs as the actor of the running action or procedure, so an
 * action, a job or a procedure that set an actor can call another action
 * with the input alone; with no actor in scope the call throws. It also carries its `actionName` and its declared
 * `errors`, which {@link isActionError} matches against.
 */
export interface Action<
  Input,
  Output,
  Errors extends Record<string, string>,
  Name extends string = string,
> {
  (input: Input, ctx?: ActionContext): Promise<Output>;
  readonly actionName: Name;
  readonly errors: Partial<Errors>;
}

/**
 * Defines a business action: one unit of work, validated, transactional,
 * attributed to an actor and traced.
 *
 * The returned function takes the schema's input type (`z.input`), so a
 * schema that coerces or transforms is called with the raw value. It
 * validates `input` with the Zod schema, async refinements and
 * transforms included, throwing {@link ValidationFailedError} on
 * failure, with the Zod messages in the locale of `ctx`; runs the handler inside a database transaction and inside the
 * actor context and the locale of `ctx`; and logs one trace line per call whether it succeeds or
 * fails. A database error the handler lets escape is classified: a
 * unique violation throws {@link ConflictError}, a foreign key violation
 * {@link ValidationFailedError} on the column (or {@link ConflictError}
 * for a row still referenced), and a deadlock,
 * serialization failure, lock timeout, cancelled statement or lost
 * connection throws {@link TransientError}.
 *
 * One action per file, under `server/actions/<domain>/`, exported under
 * the file name in camelCase. Its path is the action's `actionName`, the
 * name traces carry (`server/actions/post/archive-post.action.ts` is
 * `"post.archive-post"`); the server names every discovered action at
 * boot, so an action defined outside `server/actions/` throws when
 * called.
 *
 * @param config.input Zod schema; callers pass its input type, the handler
 * receives the parsed output.
 * @param config.errors Error codes this action can `fail()` with, mapped
 * to default messages. Without it, `fail()` accepts no code.
 * @param config.handler The work itself. It gets the parsed input,
 * `{ actor, locale }` and `fail`.
 * @param config.transaction Set to `false` to opt out of the wrapping
 * transaction. Defaults to `true`.
 * @param config.rateLimit An {@link ActionRateLimit}: `points` calls per
 * `window`, per `by` key, counted under the action's name once the input
 * is valid — or `{ limit, by }` to count against a shared limit from
 * `server/rate-limits/`. Past it the call throws {@link RateLimitedError}
 * without running the handler. `by: "user"` throws for a non-user actor,
 * `"ip"` outside a request.
 * @param config.invalidates Cache keys or globs (`"posts:*"`) that
 * {@link cacheForget} forgets once the action's transaction commits.
 * Nothing is forgotten when the handler throws.
 *
 * @example
 * ```ts
 * // server/actions/post/archive-post.action.ts
 * export const archivePostAction = defineAction({
 *   input: z.object({ id: z.number() }),
 *   errors: { ALREADY_ARCHIVED: "This post is already archived." },
 *   async handler({ id }, { actor }, fail) {
 *     const post = await findOrFail(postTable, id);
 *     if (post.archivedAt) return fail("ALREADY_ARCHIVED");
 *     await authorize(actor, "update", postTable, post);
 *     return useDb().update(postTable).set({ archivedAt: new Date() });
 *   },
 * });
 * ```
 */
export function defineAction<
  Schema extends z.ZodType,
  Output,
  Errors extends Record<string, string> = Record<never, string>,
>(config: {
  input: Schema;
  errors?: Errors;
  handler: (
    input: z.output<Schema>,
    ctx: Required<ActionContext>,
    fail: Fail<Errors>,
  ) => Output | Promise<Output>;
  transaction?: boolean;
  rateLimit?: ActionRateLimit<z.output<Schema>>;
  invalidates?: string[];
}): Action<z.input<Schema>, Output, Errors> {
  const limitCall = config.rateLimit && actionRateLimiter(config.rateLimit);
  const fail: Fail<Errors> = (code, message) => {
    throw new ActionError(code, message ?? config.errors?.[code] ?? code, defined.actionName);
  };

  async function run(
    rawInput: z.input<Schema>,
    given?: ActionContext,
  ): Promise<Output> {
    const actor = given?.actor ?? actorContext.getStore();

    if (!actor) throw new Error("defineAction: actor is required");

    const ctx: Required<ActionContext> = { actor, locale: given?.locale ?? currentLocale() };

    const start = performance.now();
    let failure: string | undefined;

    try {
      const result = await config.input.safeParseAsync(rawInput, { error: zodLocaleError(ctx.locale) });

      if (!result.success) throw new ValidationFailedError(result.error);

      await limitCall?.(defined.actionName, result.data, ctx.actor);

      const runHandler = async () => {
        const output = await config.handler(result.data, ctx, fail);

        const invalidates = config.invalidates ?? [];

        if (invalidates.length > 0) {
          await onCommit(async () => {
            for (const key of invalidates) await cacheForget(key);
          });
        }

        return output;
      };

      return await actorContext.run(ctx.actor, () =>
        localeScope.run(ctx.locale, () => (config.transaction === false ? runHandler() : transaction(runHandler))),
      );
    } catch (error) {
      const surfaced = classifyError(error) ?? error;

      failure = errorMessage(surfaced);
      throw surfaced;
    } finally {
      logActionCall({
        action: defined.actionName,
        actor: ctx.actor,
        durationMs: performance.now() - start,
        ok: failure === undefined,
        ...(failure === undefined ? {} : { error: failure }),
      });
    }
  }

  const errors: Partial<Errors> = config.errors ?? {};

  const defined: Action<z.input<Schema>, Output, Errors> = awaitingName(
    Object.assign(run, { actionName: "", errors }),
    "action",
    "actionName",
  );

  return defined;
}
