import { z } from "zod";

export const welcomeMail = defineMail({
  input: z.object({ to: z.email(), name: z.string() }),
  subject: ({ name }, { t }) => t("mail.welcome.subject", { name }),
  template: "Welcome",
  preview: () => ({ to: "ada@example.com", name: "Ada" }),
});
