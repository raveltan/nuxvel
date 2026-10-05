import { z } from "zod";
import { defineEvent } from "../../events/define-event";

/**
 * Emitted when Stripe reports a refund of a one-time payment.
 * `amountRefunded` is the total refunded so far, in the currency's
 * smallest unit; `fullyRefunded` tells whether it covers the whole
 * payment, after which `paid()` is `false`.
 *
 * Auto-imported on the server when `nuxvel.billing` is on.
 *
 * @example
 * ```ts
 * export const courseUnenrollListener = defineListener({
 *   event: billingRefundedEvent,
 *   async handler({ userId, product, fullyRefunded }) {
 *     if (fullyRefunded && product === "course") await unenrollAction({ userId }, { actor: systemActor("billing") });
 *   },
 * });
 * ```
 */
export const billingRefundedEvent = defineEvent({
  payload: z.object({
    userId: z.string(),
    product: z.string(),
    checkoutSessionId: z.string(),
    amountRefunded: z.number().int(),
    fullyRefunded: z.boolean(),
  }),
});
