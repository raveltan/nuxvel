import { and, eq, inArray, isNull } from "drizzle-orm";
import { useDb } from "../database/client";
import type { Product } from "./define-product";
import { productStoredName } from "./products";
import { billingSubscriptionsTable } from "./tables";

export const SUBSCRIBED_STATUSES = ["active", "trialing"];

/**
 * Whether a user has a subscription that gives access: one whose Stripe
 * status is `active` or `trialing`, to `product` when given, to any
 * product otherwise. A subscription cancelled at the end of its period
 * stays active until then. A `past_due` subscription, whose renewal
 * failed, does not count.
 *
 * Auto-imported on the server when `nuxvel.billing` is on. It reads
 * `billing_subscriptions`, which the Stripe webhook keeps up to date, and
 * makes no call to Stripe.
 *
 * @example
 * ```ts
 * report: authedProcedure.query(async ({ ctx }) => {
 *   if (!(await subscribed(ctx.user, $products.pro))) throw new ForbiddenError("Reports need the Pro plan");
 *   return buildReport(ctx.user.id);
 * }),
 * ```
 */
export async function subscribed(user: { id: string }, product?: Product): Promise<boolean> {
  const rows = await useDb()
    .select({ id: billingSubscriptionsTable.id })
    .from(billingSubscriptionsTable)
    .where(
      and(
        eq(billingSubscriptionsTable.userId, user.id),
        inArray(billingSubscriptionsTable.status, SUBSCRIBED_STATUSES),
        isNull(billingSubscriptionsTable.endedAt),
        product ? eq(billingSubscriptionsTable.product, productStoredName(product)) : undefined,
      ),
    )
    .limit(1);

  return rows.length > 0;
}
