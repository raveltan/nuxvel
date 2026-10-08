import { z } from "zod";
import { findStripeObject, saveStripeObject } from "../../../../../src/runtime/server/testing/stripe/state";
import { payCheckoutSession } from "../../../../../src/runtime/server/testing/stripe/scenarios";
import { courseProduct } from "#server/products/_course.product";
import { checkout } from "@nuxvel/nuxt/server/billing";

const body = z.object({ user: z.object({ id: z.string(), email: z.string() }) });

export default defineEventHandler(async (event) => {
  const { user } = body.parse(await readBody(event));
  const url = await checkout(user, courseProduct, { successUrl: "/", cancelUrl: "/" });
  const sessionId = new URL(url).pathname.split("/").at(-1) ?? "";
  const session = findStripeObject(sessionId);

  if (!session) throw new Error("no session");

  saveStripeObject({ ...session, amount_subtotal: 1, amount_total: 1 });

  try {
    await payCheckoutSession(sessionId);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
