import { awaitingName } from "../discovery/definition-name";

/**
 * What a user can buy, defined with {@link defineProduct}: a Stripe price
 * and whether it renews.
 */
export interface Product<Name extends string = string> {
  readonly name: Name;
  lookupKey: string;
  mode: "subscription" | "payment";
}

/**
 * Defines a product that a user can buy, in its own file under
 * `server/products/`, as a named export ending in `Product`. The file's
 * path names it: `server/products/pro.product.ts` is the product `"pro"`,
 * which `$products.pro` refers to.
 *
 * Auto-imported on the server when `nuxvel.billing` is on.
 *
 * @param config.lookupKey The lookup key of the Stripe price. Give the
 * price in test mode and the one in live mode the same key, and one
 * product works in both.
 * @param config.mode `"subscription"` for a price that renews, `"payment"`
 * for a one-time payment.
 *
 * @example
 * ```ts
 * // server/products/pro.product.ts
 * export const proProduct = defineProduct({ lookupKey: "pro_monthly", mode: "subscription" });
 * ```
 */
export function defineProduct(config: Omit<Product, "name">): Product {
  return awaitingName({ name: "", ...config }, "product");
}
