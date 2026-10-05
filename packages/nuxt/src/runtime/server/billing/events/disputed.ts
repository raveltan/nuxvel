import { z } from "zod";
import { defineEvent } from "../../events/define-event";

/**
 * Emitted when the user's bank disputes a one-time payment, a
 * chargeback. `paid()` is `false` from then on. `reason` is Stripe's,
 * such as `"fraudulent"`. Answer the dispute in the Stripe dashboard.
 *
 * Auto-imported on the server when `nuxvel.billing` is on.
 *
 * @example
 * ```ts
 * export const disputeAlertListener = defineListener({
 *   event: billingDisputedEvent,
 *   async handler({ userId, reason }) {
 *     useLogger("billing").warn(`user ${userId} disputed a payment: ${reason}`);
 *   },
 * });
 * ```
 */
export const billingDisputedEvent = defineEvent({
  payload: z.object({
    userId: z.string(),
    product: z.string(),
    checkoutSessionId: z.string(),
    reason: z.string(),
  }),
});
