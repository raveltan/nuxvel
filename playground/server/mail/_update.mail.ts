import { z } from "zod";

export default defineMail({
  input: z.object({ to: z.email(), title: z.string(), body: z.string(), url: z.string().optional() }),
  subject: ({ title }) => title,
  template: "_Update",
});
