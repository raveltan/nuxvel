import { probeHappened } from "#server/events/_probe/happened";
import { defineListener } from "@nuxvel/nuxt/server/events";

export default defineListener({
  event: probeHappened,
  sync: true,
  handler: () => {},
});
