import { z } from "zod";
import { defineEvent } from "../../events/define-event";

/**
 * Emitted when Stripe reports a change to a user's subscription: a new
 * subscription, a renewal, a failed payment, a plan change or a
 * cancellation. `status` is Stripe's status, such as `"active"`,
 * `"past_due"` or `"canceled"`; `previousStatus` is `null` for a new
 * subscription. Listen to it to grant or remove what the product gives.
 *
 * Auto-imported on the server when `nuxvel.billing` is on.
 *
 * @example
 * ```ts
 * export const billingWelcomeListener = defineListener({
 *   event: billingSubscriptionChangedEvent,
 *   async handler({ userId, product, status, previousStatus }) {
 *     if (status === "active" && previousStatus === null) await $notifications.welcomePro.notify(userId, { product });
 *   },
 * });
 * ```
 */
export const billingSubscriptionChangedEvent = defineEvent({
  payload: z.object({
    userId: z.string(),
    product: z.string(),
    subscriptionId: z.string(),
    status: z.string(),
    previousStatus: z.string().nullable(),
    cancelAtPeriodEnd: z.boolean(),
  }),
});
