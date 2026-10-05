import { defineSchedule } from "../define-schedule";
import { pruneOutbox } from "../prune-outbox";

export default defineSchedule({
  at: { hour: 4, minute: 30 },
  handler: async () => {
    await pruneOutbox();
  },
});
