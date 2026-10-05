import { and, eq, isNull, notInArray } from "drizzle-orm";
import { now } from "../clock/now";
import { useDb } from "../database/client";
import { useStripe } from "./use-stripe";
import { billingSubscriptionsTable } from "./tables";

const ENDED_STATUSES = ["canceled", "incomplete_expired"];

export async function cancelSubscriptionsOf(userId: string) {
  const open = await useDb({ root: true })
    .select({ id: billingSubscriptionsTable.id })
    .from(billingSubscriptionsTable)
    .where(
      and(
        eq(billingSubscriptionsTable.userId, userId),
        notInArray(billingSubscriptionsTable.status, ENDED_STATUSES),
        isNull(billingSubscriptionsTable.endedAt),
      ),
    );

  for (const { id } of open) {
    const canceled = await useStripe().subscriptions.cancel(id);

    await useDb({ root: true })
      .update(billingSubscriptionsTable)
      .set({
        status: canceled.status,
        cancelAtPeriodEnd: canceled.cancel_at_period_end,
        endedAt: canceled.ended_at ? new Date(canceled.ended_at * 1000) : now(),
        updatedAt: now(),
      })
      .where(eq(billingSubscriptionsTable.id, id));
  }
}
