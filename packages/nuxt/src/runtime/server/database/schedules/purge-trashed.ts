import { defineSchedule } from "../../jobs/define-schedule";
import { purgeTrashed } from "../purge-trashed";

export default defineSchedule({
  at: { hour: 4 },
  handler: async () => {
    await purgeTrashed();
  },
});
