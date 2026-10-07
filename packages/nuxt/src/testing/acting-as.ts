import { $fetch, fetch } from "@nuxt/test-utils/e2e";
import type { AppRouter } from "../runtime/server/trpc/router";
import { addSessionCookie, type LoginPage, type Session, sessionOf, withSessionCookie } from "./session";
import { callControlChannel } from "./control-channel";
import { callApp } from "./settled";
import { type ListenToChannels, listener } from "./listen";
import { type UploadFile, uploader } from "./upload";
import { LOCALE_HEADER } from "../runtime/shared/trpc/locale-header";
import { recordedVisit, visit, type VisitOptions } from "./visit";

/** The app router's caller in {@link TestClient}. */
export type TestCaller = ReturnType<AppRouter["createCaller"]>;

/**
 * What {@link guest} hands back: one identity with each way to reach the
 * app. {@link actingAs} hands back the same with a session, see
 * {@link SignedInTestClient}.
 */
export interface TestClient {
  /** A typed tRPC caller of the app router, named like `$api` in the app. */
  api: TestCaller;
  /** `fetch` from `@nuxt/test-utils/e2e`: a path on the app under test, the raw `Response`. */
  fetch: typeof fetch;
  /** `$fetch` from `@nuxt/test-utils/e2e`: a path on the app under test, the parsed body typed by the route. */
  $fetch: typeof $fetch;
  /** {@link visit}: opens the path in a new Playwright page and records its errors. */
  visit: typeof visit;
  /**
   * Uploads `file` as the upload `name` of `server/uploads/` and returns its `tmp/` key.
   *
   * It asks for the upload URL as this client, sends the file to it with `PUT`,
   * and resolves with the key that {@link promoteUpload} accepts.
   * A refusal of the URL, for example `403` from `authorize` or `400` from
   * `maxSize`, rejects with an error that has `statusCode`. To check the
   * status of the request itself, call `fetch("/api/uploads/<name>")`.
   * The test needs the storage settings of {@link expectStored}.
   *
   * @example
   * ```ts
   * const key = await actingAs(user).upload("post-cover", new File([bytes], "cover.png", { type: "image/png" }));
   * await expectStored(key);
   * ```
   */
  upload: UploadFile;
  /**
   * Opens a channel stream as this client and resolves after its `connected` event.
   *
   * Takes a channel in the server form (`"tasks?projectId=1"`) or an array of
   * them. It resolves to `{ channels, refused, next(), close() }`: the channels
   * the app accepted and refused, and `next()` for the next `{ event, payload }`
   * of an accepted channel, which skips `ping`. When the app accepts none, it
   * rejects with `{ code: "FORBIDDEN" | "NOT_FOUND" }`, so {@link toBeTrpcError}
   * matches. The end of the test closes the stream.
   *
   * Use {@link expectBroadcast} to check that the app broadcast. Use `listen`
   * to test who may listen and that a broadcast arrives.
   *
   * @example
   * ```ts
   * await expect(guest().listen("tasks")).rejects.toBeTrpcError("FORBIDDEN");
   * const stream = await actingAs(user).listen(`tasks?projectId=${project.id}`);
   * await runJob("task.create", { projectId: project.id });
   * expect(await stream.next()).toMatchObject({ event: "created" });
   * ```
   *
   * @param options - `lastEventId` replays the events after that ID, as a
   * browser does when it reconnects. `next()` returns each event's `id`.
   */
  listen: ListenToChannels;
}

/**
 * What {@link actingAs} hands back: a {@link TestClient} whose `fetch`,
 * `$fetch` and `visit` send a real session cookie of the user.
 *
 * The app creates the session on the first `fetch`, `$fetch`, `visit`
 * or `login`, and they all share it. The session counts as two-factor
 * verified for {@link adminProcedure} when the user has two-factor
 * sign-in on, unless the `twoFactorVerified` option says otherwise.
 */
export interface SignedInTestClient extends TestClient {
  /**
   * Puts the session cookie in the browser context of a page from
   * `createPage()`, so its next navigation is signed in. Use it only
   * for a page that `visit` cannot open, for example a page that must
   * go offline.
   */
  login(page: LoginPage): Promise<void>;
}

export interface CallerPath {
  userId: string | undefined;
  path: string[];
  headers: () => Promise<Headers>;
}

export const callerPaths = new WeakMap<object, CallerPath>();

function callerAt(userId: string | undefined, headers: () => Promise<Headers>, path: string[]): unknown {
  const caller = new Proxy(function procedure() {}, {
    get: (_target, key) =>
      typeof key === "string" && key !== "then" ? callerAt(userId, headers, [...path, key]) : undefined,
    apply: (_target, _this, args: unknown[]) =>
      headers().then((sent) => callApp("call", { userId, path: path.join("."), input: args[0] }, sent)),
  });

  callerPaths.set(caller, { userId, path, headers });

  return caller;
}

function testCaller(userId: string | undefined, headers: () => Promise<Headers>) {
  // a proxy builds each procedure path at runtime; only the router's type knows the shape
  return callerAt(userId, headers, []) as TestCaller;
}

function merged(base: HeadersInit | undefined, own: HeadersInit | undefined): Headers {
  const result = new Headers(base);

  new Headers(own).forEach((value, name) => result.set(name, value));

  return result;
}

type Authorize = (headers: Headers) => Promise<Headers>;

function signedFetch(authorize: Authorize, base: HeadersInit | undefined): typeof fetch {
  return async (path, options = {}) => fetch(path, { ...options, headers: await authorize(merged(base, options.headers)) });
}

function signed$fetch(authorize: Authorize, base: HeadersInit | undefined): typeof $fetch {
  // nitro types $fetch with every app route: a call with a plain string path hits TS2321, so the wrapper forwards it untyped
  const forward = $fetch as unknown as (path: string, options: object) => Promise<unknown>;

  return (async (path: string, options: { headers?: HeadersInit } = {}) =>
    forward(path, { ...options, headers: await authorize(merged(base, options.headers)) })) as typeof $fetch;
}

function withLocale(headers: HeadersInit | undefined, locale: string | undefined): Headers {
  const result = new Headers(headers);

  if (locale) result.set(LOCALE_HEADER, locale);

  return result;
}

function visitIn(locale: string | undefined, options: VisitOptions): VisitOptions {
  return locale ? { locale, ...options } : options;
}

export function sessionClient(
  session: Session,
  trpcUserId: string | undefined,
  trpcHeaders: () => Promise<Headers>,
  base?: HeadersInit,
  locale?: string,
): SignedInTestClient {
  const cookie: Authorize = (headers) => withSessionCookie(headers, session);
  const signed = signedFetch(cookie, base);

  return {
    api: testCaller(trpcUserId, trpcHeaders),
    fetch: signed,
    $fetch: signed$fetch(cookie, base),
    upload: uploader(signed),
    listen: listener(signed),
    visit: (target, options: VisitOptions = {}) => recordedVisit(target, visitIn(locale, options), session),
    login: (page) => addSessionCookie(page, session),
  };
}

function bearerOf(user: { id: string }): Authorize {
  let key: Promise<{ key: string }> | undefined;

  return async (headers) => {
    key ??= callControlChannel<{ key: string }>("api-key", { userId: user.id });
    headers.set("authorization", `Bearer ${(await key).key}`);

    return headers;
  };
}

/**
 * Options for {@link actingAs}.
 */
export interface ActingAsOptions {
  /**
   * Headers that `api`, `fetch` and `$fetch` send with each call, for example
   * `Idempotency-Key` to test {@link idempotent}, `x-forwarded-for` to test a
   * rate limit by IP (it counts only when `nuxvel.security.trustProxy` is set)
   * or `accept-language`. A header that a `fetch` or `$fetch` call gives itself
   * wins. `visit` and `login` do not send them.
   */
  headers?: HeadersInit;
  /**
   * Whether the session passed a second factor, for {@link adminProcedure}.
   * Default: `true` when the user has two-factor sign-in on. Give `false` to
   * test that an admin tool refuses a session without the second factor.
   */
  twoFactorVerified?: boolean;
  /**
   * Signs each call in with a new API key of the user instead of a session, as a
   * REST client does. {@link roleProcedure}, {@link adminProcedure} and
   * {@link freshProcedure} refuse it unless they accept keys. `twoFactorVerified`
   * has no effect.
   */
  apiKey?: boolean;
  /**
   * A locale code of the app, for example `"zh"`. `api`, `fetch` and
   * `$fetch` send it as the locale of the page, so
   * {@link currentLocale} and `ctx.locale` give it. `visit` opens the
   * page in it, as its own `locale` option does.
   */
  locale?: string;
}

/**
 * What `actingAs(user, { apiKey: true })` hands back: a {@link TestClient}
 * without `visit`, whose `api`, `fetch` and `$fetch` send
 * `Authorization: Bearer <key>` of a new API key of the user and no session.
 */
export type ApiKeyTestClient = Omit<TestClient, "visit">;

/**
 * Reaches the app as `user`, for functional and end-to-end tests: a
 * typed tRPC caller, `fetch` and `$fetch` for a server route, and
 * {@link visit} for a page, see {@link SignedInTestClient}.
 *
 * `api` runs in the Vitest process and calls the app that `@nuxvel/nuxt/testing/setup` started over
 * its test control channel: the app loads the user's row and runs the
 * procedure with the context a request would get, so an
 * `authedProcedure` sees that user (role included) as `ctx.user` and
 * `ctx.actor`, and so does a `publicProcedure`. Results keep their
 * types (dates included); a rejection keeps the error's `code`,
 * `actionCode` and `fields` for {@link toBeTrpcError},
 * {@link toBeActionError} and {@link toHaveValidationErrors}. `fetch`,
 * `$fetch`, `visit` and `login` send a real session cookie of the user.
 * See {@link guest} for the same with no session.
 *
 * @param options.headers Headers to send with each `api`, `fetch` and `$fetch` call.
 * @param options.apiKey Sign each call in with a new API key and no session; the result has no `visit` and no `login`.
 * @param options.twoFactorVerified Whether the session passed a second factor. Default: whether the user has two-factor sign-in on.
 * @param options.locale The locale of each call and page, for example `"zh"`.
 *
 * @example
 * ```ts
 * const ada = actingAs(await userFactory());
 * const post = await ada.api.post.create({ title: "Hello", body: "" });
 * const { unreadCount } = await ada.$fetch("/api/notifications");
 * const page = await ada.visit(`/posts/${post.id}`);
 * const retrying = actingAs(user, { headers: { "Idempotency-Key": "k1" } });
 * const response = await actingAs(user, { apiKey: true }).fetch("/api/v1/me");
 * const inChinese = await actingAs(user, { locale: "zh" }).api.post.list();
 * ```
 */
export function actingAs(user: { id: string }, options: ActingAsOptions & { apiKey: true }): ApiKeyTestClient;
export function actingAs(user: { id: string }, options?: ActingAsOptions): SignedInTestClient;
export function actingAs(user: { id: string }, options: ActingAsOptions = {}): SignedInTestClient | ApiKeyTestClient {
  const headers = withLocale(options.headers, options.locale);

  if (options.apiKey) {
    const bearer = bearerOf(user);
    const signed = signedFetch(bearer, headers);

    return {
      api: testCaller(undefined, () => bearer(new Headers(headers))),
      fetch: signed,
      $fetch: signed$fetch(bearer, headers),
      upload: uploader(signed),
      listen: listener(signed),
    };
  }

  const session = sessionOf(user, options.twoFactorVerified);

  return sessionClient(
    session,
    user.id,
    () => (options.twoFactorVerified === undefined ? Promise.resolve(new Headers(headers)) : withSessionCookie(headers, session)),
    headers,
    options.locale,
  );
}

/**
 * Reaches the app with no session, for asserting what anonymous callers
 * can and cannot do. Works like {@link actingAs}.
 *
 * @param options.locale The locale of each call and page, as in {@link ActingAsOptions}.
 *
 * @example
 * ```ts
 * await expect(guest().api.post.create({ title: "x", body: "" }))
 *   .rejects.toBeTrpcError("UNAUTHORIZED");
 * expect((await guest().fetch("/api/notifications")).status).toBe(401);
 * const inChinese = await guest({ locale: "zh" }).api.post.list();
 * ```
 */
export function guest(options: Pick<ActingAsOptions, "locale"> = {}): TestClient {
  if (!options.locale) return { api: testCaller(undefined, async () => new Headers()), fetch, $fetch, visit, upload: uploader(fetch), listen: listener(fetch) };

  const { locale } = options;
  const headers = withLocale(undefined, locale);
  const unsigned: Authorize = async (sent) => sent;
  const signed = signedFetch(unsigned, headers);

  return {
    api: testCaller(undefined, async () => new Headers(headers)),
    fetch: signed,
    $fetch: signed$fetch(unsigned, headers),
    visit: (target, visitOptions: VisitOptions = {}) => visit(target, visitIn(locale, visitOptions)),
    upload: uploader(signed),
    listen: listener(signed),
  };
}
