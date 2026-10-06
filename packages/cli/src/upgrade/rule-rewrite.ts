import { join, resolve } from "node:path";
import { nuxvelPlugin } from "@nuxvel/nuxt/eslint/architecture";
import { type ESLint, Linter } from "eslint";
import { tsConfig, vueConfig } from "../arch/lint-architecture.ts";
import type { Rewrite } from "./codemod.ts";

const root = resolve("/");

export function ruleRewrite(rule: string, plugin: ESLint.Plugin = nuxvelPlugin) {
  const ruleId = `nuxvel/${rule}`;
  const ruleConfig: Linter.Config = { plugins: { nuxvel: plugin }, rules: { [ruleId]: "error" } };
  const config = [tsConfig(ruleConfig), vueConfig(ruleConfig)];
  const linter = new Linter({ cwd: root });

  return (source: string, file: string): Rewrite => {
    const { output, messages } = linter.verifyAndFix(source, config, { filename: join(root, file) });

    return {
      output,
      manual: messages.filter((message) => message.ruleId === ruleId).map(({ line, message }) => ({ line, message })),
    };
  };
}
