import { h } from "vue";
import { z } from "zod";
import { defineMail } from "../../../../src/runtime/server/mail/define-mail";

export const previewKeepsLiteralTypes = defineMail({
  input: z.object({ to: z.email(), status: z.enum(["investigating", "identified"]) }),
  subject: ({ status }) => status,
  render: () => h("div"),
  preview: () => ({ to: "ada@example.com", status: "identified" }),
});
