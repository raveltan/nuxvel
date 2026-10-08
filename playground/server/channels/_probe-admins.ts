import { defineChannel } from "@nuxvel/nuxt/server/realtime";

export default defineChannel({
  events: {},
  authorize: ({ user }) => user?.role === "admin",
});
