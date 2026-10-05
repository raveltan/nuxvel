/** What a Stripe test helper did: the IDs of the Checkout session, and of the subscription or the payment intent it touched. */
export interface StripeScenarioResult {
  checkoutSessionId?: string;
  subscriptionId?: string;
  paymentIntentId?: string;
}
