import { z } from "zod";

export default {
  save: publicProcedure.input(actionFormProbeInput).output(z.string()).mutation(({ input }) => JSON.stringify(input)),
  edge: publicProcedure.input(actionFormEdgeProbeInput).output(z.string()).mutation(({ input }) => JSON.stringify(input)),
};
