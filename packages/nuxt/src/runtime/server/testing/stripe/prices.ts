import products from "#nuxvel/products";
import type { Product } from "../../billing/define-product";
import { definitionsIn } from "../../discovery/aliases";
import type { Renamed } from "../../discovery/renamed";
import { type FakePrice, type StripeObject, type StripeReply, fakeStripeOptions, stripeError, stripeList } from "./state";
import { type FormValue, formList, formText } from "./form";

const DEFAULT_AMOUNT = 1000;
const DEFAULT_CURRENCY = "usd";

function productPrices(): Record<string, FakePrice> {
  const entries: readonly (Product | Renamed<Product>)[] = products;

  return Object.fromEntries(
    definitionsIn(entries).map((product) => [product.lookupKey, product.mode === "subscription" ? { interval: "month" } : {}]),
  );
}

function priceObject(lookupKey: string, price: FakePrice): StripeObject {
  return {
    id: `price_test_${lookupKey}`,
    object: "price",
    active: true,
    currency: price.currency ?? DEFAULT_CURRENCY,
    unit_amount: price.amount ?? DEFAULT_AMOUNT,
    lookup_key: lookupKey,
    product: `prod_test_${lookupKey}`,
    type: price.interval ? "recurring" : "one_time",
    recurring: price.interval ? { interval: price.interval, interval_count: 1 } : null,
    livemode: false,
  };
}

function fakePrices(): StripeObject[] {
  const configured = fakeStripeOptions().prices ?? {};
  const merged: Record<string, FakePrice | null> = { ...productPrices() };

  for (const [lookupKey, price] of Object.entries(configured)) {
    merged[lookupKey] = price === null ? null : { ...merged[lookupKey], ...price };
  }

  return Object.entries(merged).flatMap(([lookupKey, price]) => (price ? [priceObject(lookupKey, price)] : []));
}

export function fakePrice(id: string): StripeObject | undefined {
  return fakePrices().find((price) => price.id === id);
}

export function listPrices(params: Record<string, FormValue>): StripeReply {
  const lookupKeys = formList(params, "lookup_keys").filter((key): key is string => typeof key === "string");
  const matching = fakePrices().filter((price) => lookupKeys.length === 0 || lookupKeys.includes(String(price.lookup_key)));

  return stripeList(formText(params, "active") === "false" ? [] : matching, "/v1/prices");
}

export function retrievePrice(id: string): StripeReply {
  const price = fakePrice(id);

  return price ? { status: 200, body: price } : stripeError(404, `No such price: '${id}'`);
}
