import { h } from "vue";
import { z } from "zod";
import { MAX_USER_NAME_LENGTH } from "../user-name";
import { defineMail } from "../../mail/define-mail";
import { securityChangeSchema } from "./security-change";
import SecurityNotice from "./SecurityNotice.vue";

export default defineMail({
  input: z.object({ to: z.email(), name: z.string().transform((name) => name.slice(0, MAX_USER_NAME_LENGTH)), change: securityChangeSchema, device: z.string().transform((device) => device.slice(0, MAX_USER_NAME_LENGTH)).optional(), url: z.url().max(2048).optional() }),
  subject: (_input, { t }) => t("nuxvel.auth.securityNotice.subject"),
  render: (props) => h(SecurityNotice, props),
  preview: () => ({ to: "ada@example.com", name: "Ada", change: securityChangeSchema.enum.password }),
});
