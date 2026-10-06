import {
  type _EmptyObject,
  type EntryKey,
  type EntryKeyTagged,
  useMutation,
  type UseMutationOptions,
  type UseMutationReturn,
  useQuery,
  type UseQueryOptions,
  type UseQueryReturn,
} from "@pinia/colada";
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
import type { CacheKey } from "../../shared/cache/cache-key";

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

/** The options `mutationOptions()` takes. */
export interface TRPCMutationOptionsInput<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
> {
  /**
   * Replaces what the mutation invalidates after it succeeds, see
   * {@link TRPCInvalidate}.
   */
  invalidate?: TRPCInvalidate<TRouter, TProcedure>;
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
 * The options `.useMutation()` takes: Pinia Colada's `useMutation()`
 * options without `mutation`, which the procedure provides, such as
 * `onSuccess`, `onError` or `onSettled`, and `invalidate`.
 */
export type TRPCUseMutationOptions<
  TRouter extends AnyTRPCRouter,
  TProcedure extends AnyTRPCProcedure,
  TContext extends Record<any, any> = _EmptyObject,
> = Omit<
  UseMutationOptions<Output<TRouter, TProcedure>, inferProcedureInput<TProcedure>, TRPCClientError<TRouter>, TContext>,
  "mutation"
> &
  TRPCMutationOptionsInput<TRouter, TProcedure>;

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
   * Builds `{ mutation }` for Pinia Colada's `useMutation()`. Each call
   * of `mutationOptions()` picks one idempotency key and sends it with
   * every mutation, so a procedure with `idempotent()` runs the same
   * input once. `useActionForm()`, `toasted()` and `optimistic()` keep
   * its `invalidate`.
   *
   * @param options.invalidate Replaces what the mutation invalidates
   * after it succeeds: tags, a function `(result, input) => tags`, or
   * `false` for none.
   *
   * @example
   * ```ts
   * const form = useActionForm(createPostInput, $api.post.create.mutationOptions({ invalidate: ["post", "tag"] }));
   * ```
   */
  mutationOptions(options?: TRPCMutationOptionsInput<TRouter, TProcedure>): TRPCMutationOptions<TRouter, TProcedure>;
  /**
   * Runs Pinia Colada's `useMutation()` for this procedure and returns
   * its result wrapped in `reactive()`. Call it in `setup`, like
   * `useMutation()`. Like `mutationOptions()`, it picks one idempotency
   * key and sends it with every `mutate()`.
   *
   * @param options Pinia Colada's `useMutation()` options, without `mutation`.
   * @param options.invalidate Replaces what the mutation invalidates
   * after it succeeds: tags, a function `(result, input) => tags`, or
   * `false` for none.
   *
   * @example
   * ```ts
   * const createPost = $api.post.create.useMutation({
   *   onSuccess: (post) => navigateTo({ name: "posts-id", params: { id: post.id } }),
   * });
   * createPost.mutate({ title: "Hello", body: "First post" });
   * ```
   */
  useMutation<TContext extends Record<any, any> = _EmptyObject>(
    options?: TRPCUseMutationOptions<TRouter, TProcedure, TContext>,
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

function mutationOptionsOf(client: object, procedurePath: string[], options: unknown) {
  const invalidate = typeof options === "object" && options !== null && "invalidate" in options ? { invalidate: options.invalidate } : {};
  const context = { idempotencyKey: crypto.randomUUID(), ...invalidate };

  return {
    mutation: async (mutationInput: unknown) => call(client, [...procedurePath, "mutate"], [mutationInput, { context }]),
  };
}

function useProcedureMutation(client: object, procedurePath: string[], options: unknown) {
  const colada = typeof options === "object" && options !== null ? Object.fromEntries(Object.entries(options).filter(([name]) => name !== "invalidate")) : {};

  return reactive(useMutation({ ...colada, ...mutationOptionsOf(client, procedurePath, options) }));
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
      if (method === "mutationOptions") return mutationOptionsOf(client, procedurePath, args[0]);
      if (method === "useMutation") return useProcedureMutation(client, procedurePath, args[0]);

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
