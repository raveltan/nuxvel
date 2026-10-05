import { defineSchedule } from "../../jobs/define-schedule";
import { reencryptTwoFactor } from "../reencrypt-two-factor";

export default defineSchedule({
  at: { hour: 4, minute: 15 },
  handler: async () => {
    await reencryptTwoFactor();
  },
});
