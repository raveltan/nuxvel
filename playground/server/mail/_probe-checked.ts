import { z } from "zod";

export default defineMail({
  input: z.object({
    to: z.email(),
    name: z.string().refine(async (name) => name !== "taken", { message: "That name is taken" }),
  }),
  subject: ({ name }) => `Checked, ${name}`,
  template: "Welcome",
});
