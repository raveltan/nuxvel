import { defineEventHandler, getRouterParam, readBody, sendRedirect } from "h3";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { payCheckoutSession } from "../stripe/scenarios";
import { fakeStripeOptions, findStripeObject } from "../stripe/state";
import { escapeHtml, testPage } from "../stripe/test-page";

function successUrl(session: { id: string; success_url?: unknown }) {
  return String(session.success_url).replaceAll("{CHECKOUT_SESSION_ID}", session.id);
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const session = findStripeObject(getRouterParam(event, "id") ?? "");

  if (session?.object !== "checkout.session" || session.status !== "open") return testPage("Checkout not found", "");

  const choice =
    event.method === "POST"
      ? String((await readBody<{ action?: string }>(event))?.action ?? "")
      : fakeStripeOptions().checkout ?? "manual";

  if (choice === "pay") {
    await payCheckoutSession(session.id);
    return sendRedirect(event, successUrl(session), 303);
  }

  if (choice === "decline" || choice === "cancel") return sendRedirect(event, String(session.cancel_url), 303);

  return testPage(
    "Test checkout",
    `<p>${escapeHtml(session.mode)}: ${escapeHtml(session.amount_total)} ${escapeHtml(session.currency)}</p>
<form method="post"><button name="action" value="pay">Pay</button></form>
<form method="post"><button name="action" value="cancel">Cancel</button></form>`,
  );
});
