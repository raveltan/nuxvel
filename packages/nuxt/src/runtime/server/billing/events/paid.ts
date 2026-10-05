import { z } from "zod";
import { defineEvent } from "../../events/define-event";

/**
 * Emitted once when Stripe confirms the one-time payment of a product:
 * the Checkout session is paid, and its price and amount match the
 * product. `amount` is in the currency's smallest unit. Listen to it to
 * give the user what they bought.
 *
 * Auto-imported on the server when `nuxvel.billing` is on.
 *
 * @example
 * ```ts
 * export const courseEnrollListener = defineListener({
 *   event: billingPaidEvent,
 *   async handler({ userId, product }) {
 *     if (product === "course") await enrollAction({ userId }, { actor: systemActor("billing") });
 *   },
 * });
 * ```
 */
export const billingPaidEvent = defineEvent({
  payload: z.object({
    userId: z.string(),
    product: z.string(),
    checkoutSessionId: z.string(),
    amount: z.number().int(),
    currency: z.string(),
  }),
});
