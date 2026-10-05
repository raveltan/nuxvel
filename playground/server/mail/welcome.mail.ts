import { h } from "vue";
import { z } from "zod";
import Welcome from "./templates/Welcome.vue";

export const welcomeMail = defineMail({
  input: z.object({ to: z.email(), name: z.string() }),
  subject: ({ name }, { t }) => t("mail.welcome.subject", { name }),
  render: (props) => h(Welcome, props),
  preview: () => ({ to: "ada@example.com", name: "Ada" }),
});
