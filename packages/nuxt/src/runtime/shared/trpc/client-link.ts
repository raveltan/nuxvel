import type { AnyTRPCRouter } from "@trpc/server";
import { TRPC_ERROR_CODES_BY_KEY } from "@trpc/server/rpc";
import { observable } from "@trpc/server/observable";
import { httpBatchLink, httpLink, splitLink, TRPCClientError, type Operation, type TRPCLink } from "@trpc/client";
import superjson from "superjson";
import { BUILD_ID_HEADER } from "./build-id-header";
import { IDEMPOTENCY_KEY_HEADER } from "./idempotency-key";
import { LOCALE_HEADER } from "./locale-header";
import { TRPC_MAX_BATCH_SIZE } from "./max-batch-size";
import { NETWORK_ERROR, NETWORK_ERROR_MESSAGE } from "./network-error";

function asNetworkError(error: TRPCClientError<AnyTRPCRouter>, op: Operation) {
  if (error.shape || op.signal?.aborted) return error;

  return new TRPCClientError<AnyTRPCRouter>(NETWORK_ERROR_MESSAGE, {
    cause: error,
    result: {
      error: {
        message: NETWORK_ERROR_MESSAGE,
        code: TRPC_ERROR_CODES_BY_KEY.SERVICE_UNAVAILABLE,
        data: { code: NETWORK_ERROR, httpStatus: 0, path: op.path },
      },
    },
  });
}

/**
 * Builds the batching tRPC link, with superjson matching the server
 * transformer. A call whose context carries an `idempotencyKey` goes
 * alone, with the key in the `Idempotency-Key` header. Shared by the
 * Nuxt plugin and any hand-rolled client.
 *
 * It sends at most 10 calls in one batch, and more calls go in more requests.
 *
 * A call that gets no tRPC answer fails with `data.code`
 * `NETWORK_ERROR` and the message "Can't reach the server. Check your
 * connection and try again.". This is the case when the request fails,
 * or when a proxy answers with HTML or an empty body. A call that the
 * caller aborts keeps its abort error.
 *
 * @param fetch Sends each batch instead of the global `fetch`, e.g. the
 * request event's in-process fetch during SSR.
 * @param buildId Sent with every call, so the server can answer
 * `CLIENT_OUTDATED` to an app from an older build.
 * @param locale Gives the locale of the page at each call. The link
 * sends it in the `x-nuxvel-locale` header, so {@link currentLocale}
 * on the server gives the locale of the page.
 */
export function createTrpcClientLink<TRouter extends AnyTRPCRouter>(
  url: string,
  fetch?: (url: string, init?: RequestInit) => Promise<Response>,
  buildId?: string,
  locale?: () => string | undefined,
): TRPCLink<TRouter> {
  const sent = { url, fetch: fetch && ((input: string | URL | Request, init?: RequestInit) => fetch(String(input), init)) };
  const buildHeaders = (): Record<string, string> => {
    const current = locale?.();
    return { ...(buildId ? { [BUILD_ID_HEADER]: buildId } : {}), ...(current ? { [LOCALE_HEADER]: current } : {}) };
  };

  const transport = splitLink<AnyTRPCRouter>({
    condition: (op) => typeof op.context.idempotencyKey === "string",
    true: httpLink({
      ...sent,
      transformer: superjson,
      headers: ({ op }) => ({ ...buildHeaders(), [IDEMPOTENCY_KEY_HEADER]: String(op.context.idempotencyKey) }),
    }),
    false: httpBatchLink({ ...sent, transformer: superjson, headers: buildHeaders, maxItems: TRPC_MAX_BATCH_SIZE }),
  });

  const link: TRPCLink<AnyTRPCRouter> = (runtime) => {
    const send = transport(runtime);

    return ({ op, next }) =>
      observable((observer) =>
        send({ op, next }).subscribe({
          next: (value) => observer.next(value),
          error: (error) => observer.error(asNetworkError(error, op)),
          complete: () => observer.complete(),
        }),
      );
  };

  // tRPC's transformer option is a conditional on the router config that never resolves for a generic TRouter
  return link as TRPCLink<TRouter>;
}
