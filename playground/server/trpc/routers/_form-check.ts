import { z } from "zod";
import { formProbeInput } from "#shared/schemas/_form-probe";
import { publicProcedure } from "@nuxvel/nuxt/server/api";

export default {
  save: publicProcedure.input(formProbeInput).output(z.void()).mutation(() => {}),
};
