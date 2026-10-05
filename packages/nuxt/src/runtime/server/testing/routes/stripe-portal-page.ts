import { defineEventHandler, getRouterParam, readBody, sendRedirect } from "h3";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { recordStripeEvent } from "../stripe/events";
import { deliverStripeEvents } from "../stripe/scenarios";
import { findStripeObject, stripeObjectsOf } from "../stripe/state";
import { cancelSubscriptionAt } from "../stripe/subscriptions";
import { escapeHtml, testPage } from "../stripe/test-page";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const session = findStripeObject(getRouterParam(event, "id") ?? "");

  if (session?.object !== "billing_portal.session") return testPage("Portal not found", "");

  const subscriptions = stripeObjectsOf("subscription").filter(
    (subscription) => subscription.customer === session.customer && subscription.status !== "canceled",
  );

  if (event.method === "POST") {
    const { subscription: id } = (await readBody<{ subscription?: string }>(event)) ?? {};
    const subscription = subscriptions.find((candidate) => candidate.id === id);

    if (subscription) await deliverStripeEvents([recordStripeEvent("customer.subscription.updated", cancelSubscriptionAt(subscription, true))]);

    return sendRedirect(event, String(session.return_url), 303);
  }

  const rows = subscriptions
    .map(
      (subscription) =>
        `<form method="post"><input type="hidden" name="subscription" value="${escapeHtml(subscription.id)}"><p>${escapeHtml(subscription.id)}: ${escapeHtml(subscription.status)}${subscription.cancel_at_period_end ? ", ends with the period" : ""}</p><button>Cancel subscription</button></form>`,
    )
    .join("\n");

  return testPage("Test billing portal", `${rows || "<p>No subscription</p>"}\n<a href="${escapeHtml(session.return_url)}">Return</a>`);
});
