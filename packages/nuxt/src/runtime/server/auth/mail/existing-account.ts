import { h } from "vue";
import { z } from "zod";
import { defineMail } from "../../mail/define-mail";
import ExistingAccount from "./ExistingAccount.vue";

export default defineMail({
  input: z.object({ to: z.email(), }),
  subject: (_input, { t }) => t("nuxvel.auth.existingAccount.subject"),
  render: () => h(ExistingAccount),
  preview: () => ({ to: "ada@example.com" }),
});
