import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { publicProcedure } from "@nuxvel/nuxt/server/api";
import { audit } from "@nuxvel/nuxt/server/audit";

const auditThroughCaller = probeNamed("_request-id-check.auditThroughCaller", defineAction({
  handler: () => audit("request-id.through-caller", { id: 1 }),
}));

export default {
  audit: publicProcedure.mutation(() =>
    auditThroughCaller({}, { actor: systemActor("_request-id-check") }),
  ),
};
