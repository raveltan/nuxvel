import { z } from "zod";
import { defineMail } from "@nuxvel/nuxt/server/mail";

export default defineMail({
  input: z.object({ to: z.email(), title: z.string(), body: z.string(), url: z.string().optional() }),
  subject: ({ title }) => title,
  template: "_Update",
});
