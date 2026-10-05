import { h } from "vue";
import { z } from "zod";
import { named } from "../../../src/runtime/server/discovery/definition-name";
import { securityChangeSchema } from "../../../src/runtime/server/auth/mail/security-change";
import { defineMail } from "../../../src/runtime/server/mail/define-mail";

export default [
  named(
    defineMail({
      input: z.object({ to: z.string(), url: z.string() }),
      subject: () => "Confirm your email address",
      render: ({ url }) => h("a", { href: url }),
    }),
    "nuxvel.auth.verify-email",
    "auth/mail/verify-email.ts",
  ),
  named(
    defineMail({
      input: z.object({ to: z.string(), name: z.string(), url: z.string() }),
      subject: () => "Reset your password",
      render: ({ url }) => h("a", { href: url }),
    }),
    "nuxvel.auth.reset-password",
    "auth/mail/reset-password.ts",
  ),
  named(
    defineMail({
      input: z.object({ to: z.string(), name: z.string(), change: securityChangeSchema, url: z.string().optional() }),
      subject: () => "Security notice for your account",
      render: ({ change }) => h("p", change),
    }),
    "nuxvel.auth.security-notice",
    "auth/mail/security-notice.ts",
  ),
  named(
    defineMail({
      input: z.object({ to: z.string() }),
      subject: () => "You already have an account",
      render: () => h("p", "You already have an account"),
    }),
    "nuxvel.auth.existing-account",
    "auth/mail/existing-account.ts",
  ),
];
