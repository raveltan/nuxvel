import type { AnyProcedureBuilder, AnyRouter, MutationProcedure, UnsetMarker } from "@trpc/server/unstable-core-do-not-import";
import type { OpenApiMeta } from "trpc-to-openapi";
import { actorContext } from "../actions/context";
import type { Action, ActionFailure } from "../actions/define-action";
import { guestActor } from "../actions/guest-actor";

/**
 * The options of `.openapi()`: the `openapi` meta of `trpc-to-openapi`
 * without `method`, and with `path` optional.
 */
export type OpenapiOptions = Omit<NonNullable<OpenApiMeta["openapi"]>, "method" | "path"> & {
  path?: `/${string}`;
};

declare module "@trpc/server/unstable-core-do-not-import" {
  interface ProcedureBuilder<TContext, TMeta, TContextOverrides, TInputIn, TInputOut, TOutputIn, TOutputOut, TCaller extends boolean> {
    /**
     * Ends the procedure with a mutation that runs `action`, an action
     * from {@link defineAction}: the input is the action's input schema,
     * which tRPC parses, and the action then parses the raw input again.
     * The output is the procedure's `.output()`, which `nuxvel test:arch`
     * requires, else the action's `output` schema, else what the action
     * returns. An error the action
     * throws, such as its {@link ActionError}, reaches the caller
     * unchanged. The action runs as the caller, and as the actor
     * `{ type: "guest", id: "guest" }` when nobody is signed in.
     *
     * @example
     * ```ts
     * export const postRouter = {
     *   update: authedProcedure.use(idempotent()).output(postSchema).action($actions.posts.updatePost),
     * };
     * ```
     */
    action<Input, Output, Served>(
      action: Action<Input, Output, Record<string, ActionFailure>, string, Served>,
    ): MutationProcedure<{
      input: TInputIn extends UnsetMarker ? Input : TInputIn & Input;
      output: TOutputOut extends UnsetMarker ? Served : TOutputOut;
      meta: TMeta;
    }>;
    /**
     * Serves the procedure over REST, see `docs/openapi.md`. The method
     * is `GET` for a query and `POST` for a mutation. Without `path`, the
     * path is the procedure path in kebab-case (`post.byId` is
     * `/post/by-id`), and without `tags`, the tag is the first segment of
     * the procedure path. A `{name}` segment in `path` fills the input
     * field `name`. `.meta({ openapi })` still sets every field by hand.
     *
     * @param options.path The path after `api.restPrefix`, such as `"/posts/{id}"`.
     * @param options.summary The summary in the OpenAPI document.
     * @param options.tags The tags in the OpenAPI document.
     * @param options.protect `false` when the endpoint needs no API key.
     *
     * @example
     * ```ts
     * export const postRouter = {
     *   byId: publicProcedure
     *     .openapi({ path: "/posts/{id}", summary: "Get a post", protect: false })
     *     .input(postIdInput)
     *     .output(postSchema)
     *     .query(({ input }) => findOrFail(postTable, input.id)),
     * };
     * ```
     */
    openapi(options: OpenapiOptions): ProcedureBuilder<TContext, TMeta, TContextOverrides, TInputIn, TInputOut, TOutputIn, TOutputOut, TCaller>;
  }
}

const CHAINED = ["input", "output", "meta", "use", "concat", "unstable_concat", "experimental_caller"] as const;

type ChainedMethods = Record<(typeof CHAINED)[number], (...args: unknown[]) => AnyProcedureBuilder>;

function runAction(action: Action<unknown, unknown, Record<string, ActionFailure>>, input: unknown) {
  return actorContext.getStore() ? action(input) : action(input, { actor: guestActor });
}

export function withProcedureMethods<B extends AnyProcedureBuilder>(builder: B): B {
  // tRPC's builder is a plain object whose methods close over its _def, so the copy keeps working
  const chained = builder as unknown as ChainedMethods;
  const extended: Record<string, unknown> = { ...chained };

  for (const key of CHAINED) extended[key] = (...args: unknown[]) => withProcedureMethods(chained[key](...args));
  extended.openapi = (options: OpenapiOptions) => withProcedureMethods(builder.meta({ openapiOptions: options }));
  extended.action = (action: Action<unknown, unknown, Record<string, ActionFailure>>) =>
    (action.output && !builder._def.output ? builder.output(action.output) : builder)
      .input(action.input)
      .use(async ({ getRawInput, next }) => next({ ctx: { rawInput: await getRawInput() } }))
      .mutation(({ ctx }) => runAction(action, ctx.rawInput));

  // the copy has every member of B, plus the action and openapi methods that the ProcedureBuilder augmentation declares
  return extended as unknown as B;
}

function kebabCase(segment: string) {
  return segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function resolveOpenapi<Router extends AnyRouter>(router: Router): Router {
  for (const [path, procedure] of Object.entries(router._def.procedures)) {
    // tRPC types _def.procedures as the nested router record, but at runtime it is flattened by dotted path
    const def = (procedure as { _def: { type: string; meta?: OpenApiMeta & { openapiOptions?: OpenapiOptions } } })._def;
    const options = def.meta?.openapiOptions;
    if (!options) continue;

    const segments = path.split(".");
    def.meta = {
      ...def.meta,
      openapi: {
        method: def.type === "query" ? "GET" : "POST",
        tags: segments.slice(0, 1),
        ...options,
        path: options.path ?? `/${segments.map(kebabCase).join("/")}`,
      },
    };
  }

  return router;
}
