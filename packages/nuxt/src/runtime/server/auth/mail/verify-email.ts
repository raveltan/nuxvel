import { h } from "vue";
import { z } from "zod";
import { defineMail } from "../../mail/define-mail";
import VerifyEmail from "./VerifyEmail.vue";

export default defineMail({
  input: z.object({ to: z.email(), url: z.url().max(2048) }),
  subject: (_input, { t }) => t("nuxvel.auth.verifyEmail.subject"),
  render: (props) => h(VerifyEmail, props),
  preview: () => ({ to: "ada@example.com", url: "https://example.com/api/auth/verify-email?token=preview" }),
});
