import { findProduct } from "../../../../../src/runtime/server/billing/products";
import { proProduct } from "#server/products/_pro.product";

export default defineEventHandler(() => ({
  pro: { name: proProduct.name, lookupKey: proProduct.lookupKey, mode: proProduct.mode },
  course: findProduct("_course")?.mode ?? null,
  missing: findProduct("missing") ?? null,
}));
