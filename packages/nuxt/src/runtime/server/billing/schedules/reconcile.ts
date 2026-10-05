import { defineSchedule } from "../../jobs/define-schedule";
import { reconcileBillingEvents } from "../reconcile";

export default defineSchedule({
  at: { hour: 3, minute: 15 },
  handler: async () => {
    await reconcileBillingEvents();
  },
});
