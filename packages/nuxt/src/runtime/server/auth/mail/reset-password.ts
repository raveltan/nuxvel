import { h } from "vue";
import { z } from "zod";
import { MAX_USER_NAME_LENGTH } from "../user-name";
import { defineMail } from "../../mail/define-mail";
import ResetPassword from "./ResetPassword.vue";

export default defineMail({
  input: z.object({ to: z.email(), name: z.string().transform((name) => name.slice(0, MAX_USER_NAME_LENGTH)), url: z.url().max(2048) }),
  subject: (_input, { t }) => t("nuxvel.auth.resetPassword.subject"),
  render: (props) => h(ResetPassword, props),
  preview: () => ({ to: "ada@example.com", name: "Ada", url: "https://example.com/api/auth/reset-password/preview" }),
});
