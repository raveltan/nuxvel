import type { ProductName } from "@nuxvel/nuxt/server/billing";
import { proProduct } from "#server/products/_pro.product";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const productNameIsTyped: IsAny<ProductName> extends true
  ? never
  : [ProductName] extends ["_course" | "_pro"]
    ? ["_course" | "_pro"] extends [ProductName]
      ? true
      : never
    : never = true;

export const productNamespaceIsTyped: IsAny<typeof proProduct> extends true ? never : true = true;
