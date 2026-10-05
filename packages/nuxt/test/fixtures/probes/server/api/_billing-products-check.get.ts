import { findProduct } from "../../../../../src/runtime/server/billing/products";

export default defineEventHandler(() => ({
  pro: { name: $products._pro.name, lookupKey: $products._pro.lookupKey, mode: $products._pro.mode },
  course: findProduct("_course")?.mode ?? null,
  missing: findProduct("missing") ?? null,
}));
