import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import type { DefinitionImport } from "../rules/explicit-imports.ts";
import { notificationInput as rule } from "../rules/notification-input.ts";
import { namespaceDefinitions } from "./explicit-imports.ts";

const mailsByApp = new Map<string, ReadonlyMap<string, DefinitionImport>>();

function mails(cwd: string) {
  const found = mailsByApp.get(cwd) ?? namespaceDefinitions(cwd, "mail");

  mailsByApp.set(cwd, found);

  return found;
}

export const notificationInput: Codemod = {
  name: "notification-input",
  version: "0.3.0",
  description:
    'Renames schema to input in defineNotification(), and in what its toMail returns, data to input and a mail name such as "post.published" to its definition, imported from "#server/mail/post/published.mail", and prints a toMail it cannot rewrite as a manual step',
  files: ["**/*.ts"],
  rewrite(source, file, cwd) {
    if (!source.includes("defineNotification(")) return { output: source, manual: [] };
    const plugin = { meta: { name: "nuxvel-upgrade" }, rules: { "notification-input": rule(mails(cwd)) } };

    return ruleRewrite("notification-input", plugin)(source, file);
  },
};
