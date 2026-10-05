import products from "#nuxvel/products";
import { type Defined, definitionsIn, resolveName, storedName } from "../discovery/aliases";
import type { Renamed } from "../discovery/renamed";
import type { Product } from "./define-product";

/** The name of every product defined under `server/products/`. */
export type ProductName = Defined<(typeof products)[number]>["name"];

function entries(): readonly (Product | Renamed<Product>)[] {
  return products;
}

export function findProduct(name: string): Product | undefined {
  return resolveName(entries(), name);
}

export function findProductByLookupKey(lookupKey: string): Product | undefined {
  return definitionsIn(entries()).find((product) => product.lookupKey === lookupKey);
}

export function productStoredName(product: Product): string {
  return storedName(entries(), product);
}
