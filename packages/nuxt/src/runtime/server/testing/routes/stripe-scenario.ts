import { defineEventHandler } from "h3";
import superjson from "superjson";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { changeFakeSubscription, completeFakeCheckout, disputeFakePayment, refundFakePayment } from "../stripe/scenarios";
import { readSuperjsonBody } from "../read-superjson-body";

type Scenario =
  | { kind: "complete-checkout"; user: { id: string; email: string }; product: string }
  | { kind: "renew" | "fail-renewal" | "cancel" | "cancel-now"; user: { id: string }; product: string }
  | { kind: "refund"; user: { id: string }; product: string; amount?: number }
  | { kind: "dispute"; user: { id: string }; product: string; reason: string };

function run(scenario: Scenario) {
  switch (scenario.kind) {
    case "complete-checkout":
      return completeFakeCheckout(scenario.user, scenario.product);
    case "refund":
      return refundFakePayment(scenario.user.id, scenario.product, scenario.amount);
    case "dispute":
      return disputeFakePayment(scenario.user.id, scenario.product, scenario.reason);
    default:
      return changeFakeSubscription(scenario.user.id, scenario.product, scenario.kind);
  }
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const scenario = await readSuperjsonBody<Scenario>(event);

  return superjson.serialize(await settle(() => run(scenario)));
});
