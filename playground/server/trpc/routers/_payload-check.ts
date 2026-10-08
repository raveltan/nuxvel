import { publicProcedure } from "@nuxvel/nuxt/server/api";

export default {
  large: publicProcedure.query(() => "x".repeat(150_000)),
};
