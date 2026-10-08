import { defineStreamHandler } from "@nuxvel/nuxt/server/realtime";

export default defineStreamHandler({
  authorize: ({ user }) => user !== null,
  handler: () => {},
});
