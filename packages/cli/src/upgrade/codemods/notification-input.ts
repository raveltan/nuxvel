import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { notificationInput as rule } from "../rules/notification-input.ts";

export const notificationInput: Codemod = {
  name: "notification-input",
  version: "0.3.0",
  description:
    'Renames schema to input in defineNotification(), and in what its toMail returns, data to input and a mail name such as "post.published" to its definition $mails.post.published, and prints a toMail it cannot rewrite as a manual step',
  files: ["**/*.ts"],
  rewrite: ruleRewrite("notification-input", { meta: { name: "nuxvel-upgrade" }, rules: { "notification-input": rule } }),
};
