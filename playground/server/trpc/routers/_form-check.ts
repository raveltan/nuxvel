import { z } from "zod";

export default {
  save: publicProcedure.input(formProbeInput).output(z.void()).mutation(() => {}),
};
