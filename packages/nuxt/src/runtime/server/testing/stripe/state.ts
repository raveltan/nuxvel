import { now } from "../../clock/now";

export interface StripeObject {
  id: string;
  object: string;
  [key: string]: unknown;
}

export interface StripeReply {
  status: number;
  body: unknown;
}

/** A price of the in-memory Stripe: its amount in the currency's smallest unit, its currency, and how often it renews. */
export interface FakePrice {
  amount?: number;
  currency?: string;
  interval?: "day" | "week" | "month" | "year";
}

/**
 * What `fakeStripe()` sets on the in-memory Stripe of a test build: the
 * prices by lookup key, and what the test Checkout page does when the
 * browser opens it.
 */
export interface FakeStripeOptions {
  prices?: Record<string, FakePrice | null>;
  checkout?: "pay" | "decline" | "manual";
}

const objects = new Map<string, StripeObject>();
const replies = new Map<string, StripeReply>();
let options: FakeStripeOptions = {};
let sequence = 0;

export function resetFakeStripe() {
  objects.clear();
  replies.clear();
  options = {};
}

export function configureFakeStripe(next: FakeStripeOptions) {
  options = { ...options, ...next, prices: { ...options.prices, ...next.prices } };
}

export function fakeStripeOptions(): FakeStripeOptions {
  return options;
}

export function nextStripeId(prefix: string) {
  sequence += 1;

  return `${prefix}_test_${sequence.toString(36).padStart(8, "0")}`;
}

export function stripeTimestamp() {
  return Math.floor(now().getTime() / 1000);
}

export function findStripeObject(id: string): StripeObject | undefined {
  return objects.get(id);
}

export function saveStripeObject<Saved extends StripeObject>(saved: Saved): Saved {
  objects.set(saved.id, saved);

  return saved;
}

export function stripeObjectsOf(type: string): StripeObject[] {
  return [...objects.values()].filter((candidate) => candidate.object === type);
}

export function rememberedReply(key: string) {
  return replies.get(key);
}

export function rememberReply(key: string, reply: StripeReply) {
  replies.set(key, reply);
}

export function stripeError(status: number, message: string, code = "resource_missing"): StripeReply {
  return { status, body: { error: { type: "invalid_request_error", code, message } } };
}

export function stripeList(data: unknown[], url: string): StripeReply {
  return { status: 200, body: { object: "list", data, has_more: false, url } };
}
