import { and, eq, inArray } from "drizzle-orm";
import { useDb } from "../database/client";
import type { Product } from "./define-product";
import { productStoredName } from "./products";
import { billingPaymentsTable } from "./tables";

export const PAID_STATUSES = ["paid", "partially_refunded"];

/**
 * Whether a user paid for a one-time product and keeps it: a payment
 * that Stripe confirmed, not fully refunded and not disputed. A partial
 * refund keeps the product.
 *
 * Auto-imported on the server when `nuxvel.billing` is on. It reads
 * `billing_payments`, which the Stripe webhook keeps up to date, and
 * makes no call to Stripe.
 *
 * @example
 * ```ts
 * lessons: authedProcedure.query(async ({ ctx }) => {
 *   if (!(await paid(ctx.user, $products.course))) throw new ForbiddenError("Buy the course first");
 *   return listLessons();
 * }),
 * ```
 */
export async function paid(user: { id: string }, product: Product): Promise<boolean> {
  const rows = await useDb()
    .select({ id: billingPaymentsTable.checkoutSessionId })
    .from(billingPaymentsTable)
    .where(
      and(
        eq(billingPaymentsTable.userId, user.id),
        eq(billingPaymentsTable.product, productStoredName(product)),
        inArray(billingPaymentsTable.status, PAID_STATUSES),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
