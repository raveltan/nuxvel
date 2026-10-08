import { authedProcedure } from "@nuxvel/nuxt/server/api";
import { useLogger } from "@nuxvel/nuxt/server/observability";

export default {
  authed: authedProcedure.query(({ ctx }) => {
    useLogger("logger-check").info("logger-check authed");
    return ctx.user.id;
  }),
};
