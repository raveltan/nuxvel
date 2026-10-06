import type { EntryKey, useQueryCache } from "@pinia/colada";
import type { Operation, OperationResultEnvelope, TRPCClientError, TRPCLink } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { type ClientTag, clientTag, type InvalidateFallback, readInvalidatesHeader } from "../../shared/trpc/invalidates-header";

function responseHeaders(context: Record<string, unknown> | undefined): Headers | undefined {
  const response = context?.response;

  return response instanceof Response ? response.headers : undefined;
}

function keyOf(tag: ClientTag): EntryKey {
  // a tag is parsed from JSON or given by the app as key parts, so every part is a valid key part
  return ["trpc", ...tag] as EntryKey;
}

function namespaceOf(op: Operation): ClientTag[] {
  const namespace = op.path.split(".").slice(0, -1);

  return namespace.length === 0 ? [] : [namespace];
}

function overriddenTags(op: Operation, envelope: OperationResultEnvelope<unknown, TRPCClientError<AnyTRPCRouter>>) {
  if (!("invalidate" in op.context)) return undefined;

  const { invalidate } = op.context;
  const result = "data" in envelope.result ? envelope.result.data : undefined;
  const tags: unknown = typeof invalidate === "function" ? invalidate(result, op.input) : invalidate;

  return Array.isArray(tags)
    ? tags.filter((tag): tag is string | unknown[] => typeof tag === "string" || Array.isArray(tag)).map(clientTag)
    : [];
}

function invalidatedTags(
  op: Operation,
  envelope: OperationResultEnvelope<unknown, TRPCClientError<AnyTRPCRouter>>,
  fallback: InvalidateFallback,
) {
  const override = overriddenTags(op, envelope);
  const headers = responseHeaders(envelope.context);
  const declared = (headers && readInvalidatesHeader(headers)) ?? [];
  const tags = override ?? [...declared, ...(fallback === "namespace" ? namespaceOf(op) : [])];

  return [...new Map(tags.map((tag) => [JSON.stringify(tag), tag])).values()];
}

function invalidateAfterCallbacks(queryCache: ReturnType<typeof useQueryCache>, keys: EntryKey[]) {
  const settledAt = Date.now();

  // after the mutation's own callbacks, so a query they already fetch again is not fetched twice in one batch
  setTimeout(() => {
    for (const key of keys)
      void queryCache.invalidateQueries({ key, predicate: (entry) => !entry.pending || entry.pending.when < settledAt });
  });
}

/**
 * Builds the tRPC link that refreshes the client cache after a
 * mutation: once a mutation succeeds, it invalidates the Pinia Colada
 * key `["trpc", ...tag]` of each tag its response names in
 * `x-nuxvel-invalidates`, and of the mutation's router namespace
 * (`post.delete` invalidates `["trpc", "post"]`) unless `fallback()`
 * gives `false`. The `invalidate` of the call's context, from
 * `mutationOptions({ invalidate })`, replaces both. It does so after the
 * `onSuccess` and `onSettled` of the mutation, and leaves a query that
 * they already fetch again. A failed mutation and a query invalidate
 * nothing. The `nuxvel:trpc` plugin adds it in the browser.
 */
export function createInvalidateLink<TRouter extends AnyTRPCRouter>(
  queryCache: () => ReturnType<typeof useQueryCache>,
  fallback: () => InvalidateFallback,
): TRPCLink<TRouter> {
  return () =>
    ({ op, next }) =>
      observable((observer) =>
        next(op).subscribe({
          next: (envelope) => {
            if (op.type === "mutation") invalidateAfterCallbacks(queryCache(), invalidatedTags(op, envelope, fallback()).map(keyOf));
            observer.next(envelope);
          },
          error: (error) => observer.error(error),
          complete: () => observer.complete(),
        }),
      );
}
