import type { FetchedRequest } from "../fetch-fake";
import { hasFakeResponse } from "../fetch-fake";
import { createCheckoutSession, retrieveCheckoutSession } from "./checkout-sessions";
import { createCustomer, retrieveCustomer } from "./customers";
import { type FormValue, parseStripeForm } from "./form";
import { createPortalSession } from "./portal-sessions";
import { listPrices, retrievePrice } from "./prices";
import { cancelSubscriptionNow, retrieveSubscription } from "./subscriptions";
import { listStripeEvents } from "./events";
import { retrieveCharge, retrieveDispute, retrievePaymentIntent } from "./payments";
import { type StripeReply, rememberReply, rememberedReply, stripeError } from "./state";

type Handle = (params: Record<string, FormValue>, id: string) => StripeReply;

const ROUTES: [method: string, path: RegExp, handle: Handle][] = [
  ["POST", /^\/v1\/customers$/, (params) => createCustomer(params)],
  ["GET", /^\/v1\/customers\/([^/]+)$/, (_params, id) => retrieveCustomer(id)],
  ["GET", /^\/v1\/prices$/, (params) => listPrices(params)],
  ["GET", /^\/v1\/prices\/([^/]+)$/, (_params, id) => retrievePrice(id)],
  ["POST", /^\/v1\/checkout\/sessions$/, (params) => createCheckoutSession(params)],
  ["GET", /^\/v1\/checkout\/sessions\/([^/]+)$/, (_params, id) => retrieveCheckoutSession(id)],
  ["POST", /^\/v1\/billing_portal\/sessions$/, (params) => createPortalSession(params)],
  ["GET", /^\/v1\/subscriptions\/([^/]+)$/, (_params, id) => retrieveSubscription(id)],
  ["DELETE", /^\/v1\/subscriptions\/([^/]+)$/, (_params, id) => cancelSubscriptionNow(id)],
  ["GET", /^\/v1\/payment_intents\/([^/]+)$/, (_params, id) => retrievePaymentIntent(id)],
  ["GET", /^\/v1\/charges\/([^/]+)$/, (_params, id) => retrieveCharge(id)],
  ["GET", /^\/v1\/disputes\/([^/]+)$/, (_params, id) => retrieveDispute(id)],
  ["GET", /^\/v1\/events$/, (params) => listStripeEvents(params)],
];

function route(method: string, url: URL, body: string): StripeReply {
  const params = parseStripeForm(method === "GET" ? url.search.slice(1) : body);

  for (const [routeMethod, path, handle] of ROUTES) {
    const match = path.exec(url.pathname);

    if (routeMethod === method && match) return handle(params, decodeURIComponent(match[1] ?? ""));
  }

  return stripeError(404, `The in-memory Stripe of a test build has no ${method} ${url.pathname}; answer it with fakeFetch()`, "resource_missing");
}

export function fakeStripeFetch(fetched: FetchedRequest[]) {
  return async (...sent: Parameters<typeof fetch>): Promise<Response> => {
    const request = new Request(...sent);

    if (hasFakeResponse(request.url)) return globalThis.fetch(request);

    const body = await request.text();
    fetched.push({ method: request.method, url: request.url, body });

    const replayKey = request.headers.get("idempotency-key");
    const key = replayKey ? `${request.method} ${new URL(request.url).pathname} ${replayKey}` : undefined;
    const reply = (key && rememberedReply(key)) || route(request.method, new URL(request.url), body);

    if (key) rememberReply(key, reply);

    return Response.json(reply.body, { status: reply.status, headers: { "request-id": `req_test_${fetched.length}` } });
  };
}
