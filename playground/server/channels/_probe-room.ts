import { defineChannel } from "@nuxvel/nuxt/server/realtime";

export default defineChannel({
  events: {},
  authorize: ({ params }) => params.id === "1",
  presence: true,
});
