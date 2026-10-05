import { type FakeResponse, type FetchedRequest, matchesUrl } from "../../runtime/server/testing/fetch-fake";
import { callControlChannel } from "../control-channel";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded } from "./records";

/**
 * Fakes every outbound `fetch()` and `$fetch()` with an absolute URL in
 * the app under test, for the rest of the test.
 *
 * Each key of `responses` is a URL, or a URL prefix that ends in `*`.
 * A matching request gets that response and is recorded for
 * {@link expectFetched}. A request that no key matches is recorded and
 * fails like a network failure, with the cause `fakeFetch: no fake
 * response for <method> <url>`, so the code under test fails instead of
 * reaching the network: `$fetch()` throws a `TransientError`.
 * `@nuxvel/nuxt/testing/setup` turns the fake off after every test.
 *
 * @example
 * ```ts
 * await fakeFetch({
 *   "https://api.stripe.com/v1/refunds": { status: 200, body: { id: "re_1" } },
 *   "https://hooks.slack.com/*": { status: 204 },
 * });
 * ```
 */
export async function fakeFetch(responses: Record<string, FakeResponse>): Promise<void> {
  await callControlChannel("fake-fetch", responses);
}

/**
 * Asserts that the app sent a request to `url` during the test, or
 * exactly `times` requests when given. `url` matches like a
 * {@link fakeFetch} key: the full URL, or a prefix that ends in `*`.
 *
 * @param options.method Counts only requests with this method, such as `"POST"`.
 * @param options.times How many matching requests there must be, 1 or more.
 * @returns The latest matching request.
 *
 * @example
 * ```ts
 * const request = await expectFetched("https://hooks.slack.com/*", { method: "POST", times: 1 });
 * ```
 */
export async function expectFetched(url: string, options: { method?: string; times?: number } = {}): Promise<FetchedRequest> {
  const { fetched } = await recordedEffects();

  return expectRecorded(
    "expectFetched",
    `a ${options.method ?? "request"} to ${url}`,
    fetched,
    (request) => matchesUrl(url, request.url) && (!options.method || request.method === options.method),
    options.times,
  );
}

/**
 * Asserts that the app sent no request to `url` during the test. `url`
 * matches like a {@link fakeFetch} key. The opposite of
 * {@link expectFetched}.
 *
 * @param options.method Counts only requests with this method, such as `"POST"`.
 *
 * @example
 * ```ts
 * await expectNotFetched("https://hooks.slack.com/*");
 * ```
 */
export async function expectNotFetched(url: string, options: { method?: string } = {}): Promise<void> {
  const { fetched } = await recordedEffects();

  expectNotRecorded(
    "expectNotFetched",
    `a ${options.method ?? "request"} to ${url}`,
    fetched,
    (request) => matchesUrl(url, request.url) && (!options.method || request.method === options.method),
  );
}
