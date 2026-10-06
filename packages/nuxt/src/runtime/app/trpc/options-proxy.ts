import {
  type _EmptyObject,
  type EntryKey,
  type EntryKeyTagged,
  type QueryCache,
  useMutation,
  type UseMutationOptions,
  type UseMutationReturn,
  useQuery,
  useQueryCache,
  type UseQueryOptions,
  type UseQueryReturn,
} from "@pinia/colada";
import type { ToastProps } from "@nuxt/ui";
import type { TRPCClientError } from "@trpc/client";
import type {
  AnyTRPCMutationProcedure,
  AnyTRPCProcedure,
  AnyTRPCQueryProcedure,
  AnyTRPCRouter,
  inferTRPCClientTypes,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  TRPCRouterRecord,
} from "@trpc/server";
import { type MaybeRefOrGetter, type Reactive, reactive, toValue } from "vue";
import { useNuxtApp } from "#app";
import { FLASH_COOKIE } from "../../shared/flash/flash-message";
import type { CacheKey } from "../../shared/cache/cache-key";
import type { OptimisticUpdate } from "../composables/optimistic";
import type { ConfirmOptions } from "../ui/confirm-options";

type Output<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> = inferTransformedProcedureOutput<inferTRPCClientTypes<TRouter>, TProcedure>;

type InputArgs<TProcedure extends AnyTRPCProcedure> =
  undefined extends inferProcedureInput<TProcedure>
    ? [input?: inferProcedureInput<TProcedure>]
    : [input: inferProcedureInput<TProcedure>];

/** A Pinia Colada query key carrying the procedure's output and error types. */
export type TRPCQueryKey<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> = EntryKeyTagged<Output<TRouter, TProcedure>, TRPCClientError<TRouter>>;

type UseQueryArgs<TRouter extends AnyTRPCRouter, TProcedure extends AnyTRPCProcedure> =
  undefined extends inferProcedureInput<TProcedure>
    ? [input?: MaybeRefOrGetter<inferProcedureInput<TProcedure>>, options?: TRPCUseQueryOptions<TRouter, TProcedure>]
    : [input: MaybeRefOrGetter<inferProcedureInput<TProcedure>>, options?: TRPCUseQueryOptions<TRouter, TProcedure>];

/** What `queryOptions()` returns: a native `useQuery()` options object. */
export interface TRPCQueryOptions<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> {
  key: TRPCQueryKey<TRouter, TProcedure>;
  query: (context?: { signal?: AbortSignal }) => Promise<Output<TRouter, TProcedure>>;
}

/**
 * The options `.useQuery()` takes: Pinia Colada's `useQuery()` options
 * without `key` and `query`, which the procedure provides, such as
 * `enabled`, `staleTime` or `placeholderData`.
 */
export type TRPCUseQueryOptions<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> = Omit<UseQueryOptions<Output<TRouter, TProcedure>, TRPCClientError<TRouter>>, "key" | "query">;

/**
 * What `.useQuery()` returns: Pinia Colada's `useQuery()` result wrapped
 * in `reactive()`, so `data`, `state`, `error` and `status` read without
 * `.value`.
 */
export type TRPCUseQueryReturn<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> = Reactive<UseQueryReturn<Output<TRouter, TProcedure>, TRPCClientError<TRouter>>>;

/**
 * Which queries a mutation invalidates after it succeeds, in place of
 * the tags its response names and its router namespace: a list of tags
 * (`"post"`, `["post", "byId", { id: 1 }]`), a function of the result and
 * the input that returns them, or `false` for none. A tag matches every
 * query under `$api.<tag>`.
 */
export type TRPCInvalidate<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> =
  | false
  | readonly CacheKey[]
  | ((result: Output<TRouter, TProcedure>, input: inferProcedureInput<TProcedure>) => readonly CacheKey[]);

/** The keys nuxvel adds to the options of `.useMutation()` and `.mutationOptions()`. */
export interface TRPCMutationOptionsInput<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
  TData = unknown,
> {
  /**
   * Replaces what the mutation invalidates after it succeeds, see
   * {@link TRPCInvalidate}.
   */
  invalidate?: TRPCInvalidate<TRouter, TProcedure>;
  /**
   * Patches a cached query before the mutation runs, see
   * {@link OptimisticUpdate}. A failure restores the previous value, and
   * the query is invalidated once the mutation settles.
   */
  optimistic?: OptimisticUpdate<inferProcedureInput<TProcedure>, TData>;
  /**
   * A Nuxt UI success toast shown each time the mutation succeeds: its
   * title, its props, or a function of the result that returns either.
   * Needs Nuxt UI and `<UApp>`.
   */
  toast?: string | ToastProps | ((result: Output<TRouter, TProcedure>) => string | ToastProps);
  /**
   * Asks with `useConfirm()` before the mutation runs, with these
   * options or a function of the input that returns them. A cancel
   * resolves with `undefined` and runs nothing else. Needs Nuxt UI and
   * `<UApp>`.
   */
  confirm?: ConfirmOptions | ((input: inferProcedureInput<TProcedure>) => ConfirmOptions);
}

/** What `mutationOptions()` returns: a native `useMutation()` options object. */
export interface TRPCMutationOptions<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> {
  mutation: (
    input: inferProcedureInput<TProcedure>,
  ) => Promise<Output<TRouter, TProcedure>>;
}

/**
 * The options `.useMutation()` and `.mutationOptions()` take: Pinia
 * Colada's `useMutation()` options without `mutation`, which the
 * procedure provides, such as `onSuccess`, `onError` or `onSettled`,
 * and the nuxvel keys of {@link TRPCMutationOptionsInput}. The
 * callbacks run after nuxvel's own.
 */
export type TRPCUseMutationOptions<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
  TContext extends Record<any, any> = _EmptyObject,
  TData = unknown,
> = Omit<
  UseMutationOptions<Output<TRouter, TProcedure>, inferProcedureInput<TProcedure>, TRPCClientError<TRouter>, TContext>,
  "mutation"
> &
  TRPCMutationOptionsInput<TRouter, TProcedure, TData>;

/**
 * What `.useMutation()` returns: Pinia Colada's `useMutation()` result
 * wrapped in `reactive()`, so `data`, `error` and `status` read without
 * `.value`.
 */
export type TRPCUseMutationReturn<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
  TContext extends Record<any, any> = _EmptyObject,
> = Reactive<
  UseMutationReturn<Output<TRouter, TProcedure>, inferProcedureInput<TProcedure>, TRPCClientError<TRouter>, TContext>
>;

interface DecoratedQuery<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCQueryProcedure,
> {
  /**
   * Builds `{ key, query }` for Pinia Colada's `useQuery()`. The key is the
   * router path plus the input, so identical input shares one cache entry.
   */
  queryOptions(
    ...args: InputArgs<TProcedure>
  ): TRPCQueryOptions<TRouter, TProcedure>;
  /**
   * Runs Pinia Colada's `useQuery()` for this procedure and returns its
   * result wrapped in `reactive()`. Pass the input as a getter or a ref
   * to fetch again when it changes. Call it in `setup`, like `useQuery()`;
   * during SSR the query renders on the server and the page does not
   * fetch it again when it hydrates. `options` pass through to
   * `useQuery()`: set `enabled: false` to wait for an input.
   *
   * @param input The procedure's input, a getter or a ref of it.
   * @param options Pinia Colada's `useQuery()` options, without `key` and `query`.
   *
   * @example
   * ```ts
   * const post = $api.post.byId.useQuery(() => ({ id: Number(route.params.id) }));
   * const posts = $api.post.list.useQuery(undefined, { staleTime: 60_000 });
   * ```
   */
  useQuery(
    ...args: UseQueryArgs<TRouter, TProcedure>
  ): TRPCUseQueryReturn<TRouter, TProcedure>;
  /**
   * The cache key for this procedure. Without input it matches every cached
   * call of the procedure, for invalidation.
   */
  key(
    input?: inferProcedureInput<TProcedure>,
  ): TRPCQueryKey<TRouter, TProcedure>;
}

interface DecoratedMutation<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCMutationProcedure,
> {
  /**
   * Builds the options of Pinia Colada's `useMutation()` for this
   * procedure, for `useActionForm()` or a plain `useMutation()`. Each
   * call picks one idempotency key and sends it with every mutation, so
   * a procedure with `idempotent()` runs the same input once. It takes
   * the options of {@link DecoratedMutation.useMutation}; call it in
   * `setup` when they hold `optimistic`.
   *
   * @param options See {@link DecoratedMutation.useMutation}.
   *
   * @example
   * ```ts
   * const form = useActionForm(createPostInput, $api.post.create.mutationOptions({ invalidate: ["post", "tag"] }));
   * ```
   */
  mutationOptions<TContext extends Record<any, any> = _EmptyObject, TData = unknown>(
    options?: TRPCUseMutationOptions<TRouter, TProcedure, TContext, TData>,
  ): TRPCMutationOptions<TRouter, TProcedure>;
  /**
   * Runs Pinia Colada's `useMutation()` for this procedure and returns
   * its result wrapped in `reactive()`. Call it in `setup`, like
   * `useMutation()`. Like `mutationOptions()`, it picks one idempotency
   * key and sends it with every `mutate()`.
   *
   * @param options Pinia Colada's `useMutation()` options, without
   * `mutation`. Its `onMutate`, `onSuccess`, `onError` and `onSettled`
   * run after nuxvel's own.
   * @param options.invalidate Replaces what the mutation invalidates
   * after it succeeds: tags, a function `(result, input) => tags`, or
   * `false` for none.
   * @param options.optimistic `{ key, apply }`: patches the cached query
   * at `key(input)` with `apply` before the mutation runs, restores it on
   * a failure and invalidates it once the mutation settles. Nothing is
   * patched when the query is not cached.
   * @param options.toast A Nuxt UI success toast each time the mutation
   * succeeds: a title, toast props, or a function of the result that
   * returns either. It replaces a `flash()` message of the mutation, so
   * the next page does not show it. A failure shows no toast. Needs Nuxt
   * UI: with `nuxvel.ui: false` it throws.
   * @param options.confirm The {@link ConfirmOptions} of a `useConfirm()`
   * dialog that opens before the mutation runs, or a function of the
   * input that returns them. On a cancel, neither the procedure nor any
   * callback runs, `status` and `error` stay as they were, and
   * `mutateAsync()` rejects with a {@link MutationCancelledError}. Needs
   * Nuxt UI.
   *
   * @example
   * ```ts
   * const createPost = $api.post.create.useMutation({
   *   onSuccess: (post) => navigateTo({ name: "posts-id", params: { id: post.id } }),
   * });
   * createPost.mutate({ title: "Hello", body: "First post" });
   *
   * const publish = $api.post.publish.useMutation({ toast: (post) => `Published ${post.title}` });
   *
   * const deletePost = $api.post.delete.useMutation({
   *   optimistic: { key: () => $api.post.list.key(input.value), apply: removeRow() },
   *   confirm: { title: "Delete post?", confirmLabel: "Delete", color: "error" },
   * });
   * ```
   */
  useMutation<TContext extends Record<any, any> = _EmptyObject, TData = unknown>(
    options?: TRPCUseMutationOptions<TRouter, TProcedure, TContext, TData>,
  ): TRPCUseMutationReturn<TRouter, TProcedure, TContext>;
}

type DecorateRecord<
  TRouter extends AnyTRPCRouter,
  TRecord extends TRPCRouterRecord,
> = {
  [K in keyof TRecord]: TRecord[K] extends AnyTRPCQueryProcedure
    ? DecoratedQuery<TRouter, TRecord[K]>
    : TRecord[K] extends AnyTRPCMutationProcedure
      ? DecoratedMutation<TRouter, TRecord[K]>
      : TRecord[K] extends TRPCRouterRecord
        ? DecorateRecord<TRouter, TRecord[K]> & {
            /** The cache key prefix shared by every query in this namespace. */
            key(): EntryKey;
          }
        : never;
};

/** The names `$api` claims on every path, which no router or procedure may use. */
export type ReservedTRPCName = "key" | "queryOptions" | "useQuery" | "mutationOptions" | "useMutation" | "then";

type ReservedPaths<TRecord extends TRPCRouterRecord, Prefix extends string = ""> = {
  [K in keyof TRecord & string]: K extends ReservedTRPCName
    ? `${Prefix}${K}`
    : TRecord[K] extends AnyTRPCProcedure
      ? never
      : TRecord[K] extends TRPCRouterRecord
        ? ReservedPaths<TRecord[K], `${Prefix}${K}.`>
        : never;
}[keyof TRecord & string];

type ReservedNameCheck<TRouter extends AnyTRPCRouter> = [
  ReservedPaths<TRouter["_def"]["record"]>,
] extends [never]
  ? []
  : [error: `tRPC path "${ReservedPaths<TRouter["_def"]["record"]>}" uses a name $api reserves; rename it`];

/**
 * The Pinia Colada helpers `$api` layers over every procedure:
 * `useQuery()`, `queryOptions()` and `key()` on queries,
 * `useMutation()` and `mutationOptions()` on mutations, `key()` on
 * namespaces.
 */
export type TRPCOptionsProxy<TRouter extends AnyTRPCRouter> = DecorateRecord<
  TRouter,
  TRouter["_def"]["record"]
>;

const KEY_PREFIX = "trpc";

function keyOf(path: string[], input: EntryKey[number] | undefined): EntryKey {
  return input === undefined ? [KEY_PREFIX, ...path] : [KEY_PREFIX, ...path, input];
}

function keyInput(args: unknown[]) {
  // a Proxy trap sees untyped arguments; TRPCOptionsProxy only lets a procedure's input through.
  return args[0] as EntryKey[number] | undefined;
}

function mutationOptionsArg(args: unknown[]) {
  // a Proxy trap sees untyped arguments; TRPCOptionsProxy only lets TRPCUseMutationOptions through.
  return args[0] as MutationOptions | undefined;
}

function childOf(node: unknown, segment: string): unknown {
  return (typeof node === "object" || typeof node === "function") && node !== null
    ? Reflect.get(node, segment)
    : undefined;
}

function call(client: object, path: string[], args: unknown[]): unknown {
  const target = path.reduce<unknown>(childOf, client);

  if (typeof target !== "function") throw new TypeError(`tRPC has no procedure call "${path.join(".")}"`);

  return target(...args);
}

function useProcedureQuery(client: object, procedurePath: string[], [input, options]: unknown[]) {
  return reactive(
    useQuery(() => {
      const procedureInput = keyInput([toValue(input)]);

      return {
        ...(typeof options === "object" ? options : {}),
        key: keyOf(procedurePath, procedureInput),
        query: async ({ signal }) => call(client, [...procedurePath, "query"], [procedureInput, { signal }]),
      };
    }),
  );
}

const ROLLBACK = Symbol("rollback");
const CANCELLED = Symbol("cancelled");

/**
 * The error `mutateAsync()` rejects with when the user cancels the
 * dialog of a mutation's `confirm` option. `useActionForm()` ignores it.
 */
export class MutationCancelledError extends Error {
  override name = "MutationCancelledError";

  constructor() {
    super("The user cancelled the mutation");
  }
}

interface HookContext {
  entry: { state: { value: unknown } };
}

declare module "#app" {
  interface NuxtApp {
    $nuxvelMutationUi?: {
      toast: (toast: ToastProps) => unknown;
      confirm: (options: ConfirmOptions) => Promise<boolean>;
    };
  }
}

interface MutationOptions {
  invalidate?: unknown;
  optimistic?: OptimisticUpdate<unknown, unknown>;
  toast?: string | ToastProps | ((result: unknown) => string | ToastProps);
  confirm?: ConfirmOptions | ((input: unknown) => ConfirmOptions);
  onSuccess?: (data: unknown, input: unknown, context: object) => unknown;
  onMutate?: (input: unknown, context: object) => unknown;
  onError?: (error: unknown, input: unknown, context?: object) => unknown;
  onSettled?: (data: unknown, error: unknown, input: unknown, context: object) => unknown;
}

function patchQuery(queryCache: QueryCache, { key, apply }: OptimisticUpdate<unknown, unknown>, input: unknown) {
  const entryKey = key(input);
  queryCache.cancelQueries({ key: entryKey, exact: true });
  const previous = queryCache.getQueryData(entryKey);

  if (previous === undefined) return undefined;

  queryCache.setQueryData(entryKey, apply(previous, input));
  return () => queryCache.setQueryData(entryKey, previous);
}

function cancelled(mutationContext: object | undefined) {
  return mutationContext !== undefined && CANCELLED in mutationContext;
}

function mutationUi() {
  const ui = useNuxtApp().$nuxvelMutationUi;

  if (!ui) throw new Error("The toast and confirm options need Nuxt UI, which nuxvel.ui: false turns off");

  return ui;
}

function mutationOptionsOf(client: object, procedurePath: string[], options: MutationOptions = {}) {
  const { invalidate, optimistic, toast, confirm, onMutate, onSuccess, onError, onSettled, ...colada } = options;
  const context = { idempotencyKey: crypto.randomUUID(), ...("invalidate" in options ? { invalidate } : {}) };
  const queryCache = optimistic && useQueryCache();
  const ui = toast === undefined && confirm === undefined ? undefined : mutationUi();

  return {
    ...colada,
    mutation: async (mutationInput: unknown, mutationContext?: object) => {
      if (cancelled(mutationContext)) throw new MutationCancelledError();
      return call(client, [...procedurePath, "mutate"], [mutationInput, { context }]);
    },
    async onMutate(input: unknown, mutationContext: HookContext) {
      if (ui && confirm && !(await ui.confirm(typeof confirm === "function" ? confirm(input) : confirm))) {
        return { [CANCELLED]: mutationContext.entry.state.value };
      }

      const rollback = queryCache && optimistic ? patchQuery(queryCache, optimistic, input) : undefined;

      try {
        const own = await onMutate?.(input, mutationContext);
        return { ...(typeof own === "object" ? own : {}), [ROLLBACK]: rollback };
      } catch (error) {
        rollback?.();
        throw error;
      }
    },
    async onSuccess(data: unknown, input: unknown, mutationContext: object) {
      if (ui && toast !== undefined) {
        const shown = typeof toast === "function" ? toast(data) : toast;
        document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0; samesite=lax`;
        ui.toast({ color: "success", ...(typeof shown === "string" ? { title: shown } : shown) });
      }
      return onSuccess?.(data, input, mutationContext);
    },
    async onError(error: unknown, input: unknown, mutationContext?: object) {
      if (cancelled(mutationContext)) return;
      const rollback: unknown = mutationContext && Reflect.get(mutationContext, ROLLBACK);
      if (typeof rollback === "function") rollback();
      return onError?.(error, input, mutationContext);
    },
    async onSettled(data: unknown, error: unknown, input: unknown, mutationContext: HookContext) {
      if (cancelled(mutationContext)) {
        mutationContext.entry.state.value = Reflect.get(mutationContext, CANCELLED);
        return;
      }
      if (queryCache && optimistic) await queryCache.invalidateQueries({ key: optimistic.key(input), exact: true });
      return onSettled?.(data, error, input, mutationContext);
    },
  };
}

function useProcedureMutation(client: object, procedurePath: string[], options: MutationOptions | undefined) {
  return reactive(useMutation(mutationOptionsOf(client, procedurePath, options)));
}

function pathProxy(client: object, path: string[]): unknown {
  return new Proxy(() => {}, {
    get: (_target, prop) =>
      typeof prop === "string" && prop !== "then" ? pathProxy(client, [...path, prop]) : undefined,
    apply: (_target, _this, args: unknown[]) => {
      const procedurePath = path.slice(0, -1);
      const method = path.at(-1);
      if (method === "key") return keyOf(procedurePath, keyInput(args));
      if (method === "queryOptions")
        return {
          key: keyOf(procedurePath, keyInput(args)),
          query: (context?: { signal?: AbortSignal }) =>
            call(client, [...procedurePath, "query"], [args[0], { signal: context?.signal }]),
        };
      if (method === "useQuery") return useProcedureQuery(client, procedurePath, args);
      if (method === "mutationOptions") return mutationOptionsOf(client, procedurePath, mutationOptionsArg(args));
      if (method === "useMutation") return useProcedureMutation(client, procedurePath, mutationOptionsArg(args));

      return call(client, path, args);
    },
  });
}

/**
 * Wraps a tRPC client so every procedure also exposes the Pinia Colada
 * option factories. Calls that are not option factories go straight to the
 * client. Keys start with `"trpc"`, so they never collide with a
 * hand-written Pinia Colada key. The proxy is not a thenable, so
 * awaiting it yields the proxy itself.
 *
 * Fails to compile when a router or procedure is named after one of the
 * helpers ({@link ReservedTRPCName}), since that path would be shadowed.
 */
export function createTrpcOptionsProxy<
  TRouter extends AnyTRPCRouter,
  TClient extends object,
>(client: TClient, ..._check: ReservedNameCheck<TRouter>): TClient & TRPCOptionsProxy<TRouter> {
  // a recursive Proxy has no structural type; the mapped type above describes it.
  return pathProxy(client, []) as TClient & TRPCOptionsProxy<TRouter>;
}
