import { z } from "zod";
import { actionFormEdgeProbeInput, actionFormProbeInput } from "#shared/schemas/_action-form-probe";
import { publicProcedure } from "@nuxvel/nuxt/server/api";

export default {
  save: publicProcedure.input(actionFormProbeInput).output(z.string()).mutation(({ input }) => JSON.stringify(input)),
  edge: publicProcedure.input(actionFormEdgeProbeInput).output(z.string()).mutation(({ input }) => JSON.stringify(input)),
};
