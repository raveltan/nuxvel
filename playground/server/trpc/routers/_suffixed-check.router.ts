import { publicProcedure } from "@nuxvel/nuxt/server/api";

export const suffixedCheckRouter = {
  ping: publicProcedure.query(() => "pong"),
};
