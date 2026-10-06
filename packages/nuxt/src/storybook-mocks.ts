import { TRPCError } from "@trpc/server";
import { getHTTPStatusCode, getHTTPStatusCodeFromError } from "@trpc/server/http";
import { TRPC_ERROR_CODES_BY_KEY, type TRPCResponse } from "@trpc/server/rpc";
import { http, HttpResponse } from "msw";
import { fn } from "storybook/test";
import superjson from "superjson";
import type { Session } from "./runtime/app/auth/session";
import { errorExtras } from "./runtime/server/trpc/error-extras";
import { trpcCalls } from "./runtime/shared/trpc/trpc-calls";
import { TRPC_PATH } from "./runtime/shared/trpc/trpc-path";
import type { TrpcMocks, TrpcPath, TrpcProcedure } from "./trpc-procedure";

export { TRPCError };
export { ConflictError, RateLimitedError, ValidationFailedError } from "./runtime/server/errors/taxonomy";
export { ActionError } from "./runtime/server/actions/action-error";

export type { TrpcMocks, TrpcPath, TrpcProcedure } from "./trpc-procedure";

/**
 * Returns an MSW handler that answers the app's tRPC calls in a story,
 * with no server.
 *
 * Put it in the `parameters.msw` list of a story. The `mswLoader` of
 * `msw-storybook-addon` in `.storybook/preview.ts` starts MSW. The handler
 * answers queries and mutations, batched or not, in the superjson format
 * that `$api` reads, so a `Date` stays a `Date`. A call to a
 * procedure that `mocks` does not name fails with `NOT_FOUND`. Pair it
 * with {@link mockUser} for a component that needs a signed-in user.
 *
 * To show an error state, throw from the mock, like a real procedure.
 * The handler sends the error in the same shape and with the same HTTP
 * status as the nuxvel server. A {@link TRPCError} keeps its code and
 * message. Any other error becomes `INTERNAL_SERVER_ERROR`. An
 * {@link ActionError}, a {@link ValidationFailedError}, a
 * {@link ConflictError} with a field and a {@link RateLimitedError} with
 * `retryAfter` also send `data.actionCode`, `data.fields` or
 * `data.retryAfter`, as the server does.
 *
 * @param mocks For each procedure, a function that takes its input and
 * returns its output, nested by router: `{ post: { byId: ({ id }) => post } }`.
 *
 * @example
 * ```ts
 * import { mockTrpc, TRPCError } from "@nuxvel/nuxt/storybook/mocks";
 *
 * export const CanEdit = {
 *   args: { post: { id: 1, title: "Hello" } },
 *   parameters: { msw: [mockTrpc({ post: { abilities: () => ({ update: true, delete: false }) } })] },
 * };
 *
 * export const Forbidden = {
 *   parameters: { msw: [mockTrpc({ post: { abilities: () => { throw new TRPCError({ code: "FORBIDDEN" }); } } })] },
 * };
 * ```
 */
export function mockTrpc(mocks: TrpcMocks) {
  return http.all(`*${TRPC_PATH}/:paths`, async ({ request }) => {
    const url = new URL(request.url);
    const batched = url.searchParams.get("batch") === "1";
    const calls = trpcCalls(url, request.method === "GET" ? null : await request.text());

    const responses: TRPCResponse[] = await Promise.all(
      calls.map(async ({ path, input }) => {
        const resolve = path.split(".").reduce<unknown>((node, key) => (node instanceof Object ? Reflect.get(node, key) : undefined), mocks);
        try {
          if (typeof resolve !== "function") throw new TRPCError({ code: "NOT_FOUND", message: `No mock for the tRPC procedure ${path}` });
          return { result: { data: await resolve(input) } };
        } catch (thrown) {
          const error = thrown instanceof TRPCError ? thrown : new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: thrown });
          const data = { code: error.code, httpStatus: getHTTPStatusCodeFromError(error), path, ...errorExtras(error) };
          return { error: { message: error.message, code: TRPC_ERROR_CODES_BY_KEY[error.code], data } };
        }
      }),
    );
    const body = responses.map((response) =>
      "error" in response ? { error: superjson.serialize(response.error) } : { result: { data: superjson.serialize(response.result.data) } },
    );

    return HttpResponse.json(batched ? body : body[0], { status: getHTTPStatusCode(responses) });
  });
}

/**
 * Returns a `fn()` spy of `storybook/test` for the tRPC procedure at
 * `path`, typed by the app router and named after the path.
 *
 * Pass it to {@link mockTrpc} at the same path. The spy records each
 * call, and `expect(spy)` of `@nuxvel/nuxt/storybook/test` checks the
 * calls with the input type of the procedure. Storybook clears the spy
 * before each story. A wrong path, or an `implementation` with a wrong
 * input or output, does not compile.
 *
 * @param path The dotted path of the procedure, such as `"post.update"`.
 * @param implementation The answer of the procedure. Without it, the spy
 * returns `undefined`.
 *
 * @example
 * ```ts
 * import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
 * import { button, expect, field, page } from "@nuxvel/nuxt/storybook/test";
 *
 * const update = trpcSpy("post.update", (input) => ({ ...post, ...input }));
 *
 * export const Saves = {
 *   parameters: { msw: [mockTrpc({ post: { update } })] },
 *   play: async () => {
 *     await field(page, "Title").fill("Hello again");
 *     await button(page, "Save post").click();
 *     await expect(update).toHaveBeenCalledWith({ id: 1, title: "Hello again", body: "Body" });
 *   },
 * };
 * ```
 */
export function trpcSpy<P extends TrpcPath>(path: P, implementation?: TrpcProcedure<P>) {
  return fn(implementation).mockName(path);
}

/**
 * Returns an MSW handler that answers the session request of
 * `useUser()`, so a story renders signed in as `user`, or signed out
 * with `null`. It also answers `POST /api/auth/sign-out`, so a story
 * can click "Sign out". After the sign-out, the handler answers the
 * session request with `null`, as the server does.
 *
 * Put it in the `parameters.msw` list of a story, like {@link mockTrpc}.
 * Fields that `user` leaves out get fixed values, for example the id
 * `user-1` and the role `user`.
 *
 * @example
 * ```ts
 * import { mockUser } from "@nuxvel/nuxt/storybook/mocks";
 *
 * export const SignedIn = { parameters: { msw: [mockUser({ name: "Ada", email: "ada@example.com" })] } };
 * export const SignedOut = { parameters: { msw: [mockUser(null)] } };
 * ```
 */
export function mockUser(user: Partial<Session["user"]> | null) {
  const now = new Date();
  let session: Session | null = user && {
    user: {
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      emailVerified: true,
      image: null,
      role: "user",
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
      ...user,
    },
    session: {
      id: "session-1",
      userId: user.id ?? "user-1",
      token: "storybook",
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };

  return http.all("*/api/auth/:endpoint", ({ request, params }) => {
    if (request.method === "GET" && params.endpoint === "get-session") return HttpResponse.json(session);
    if (request.method !== "POST" || params.endpoint !== "sign-out") return;

    session = null;

    return HttpResponse.json({ success: true });
  });
}
