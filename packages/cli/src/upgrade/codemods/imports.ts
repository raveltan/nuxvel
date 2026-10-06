import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";

const folders = "{server,app,shared,tests}/**/*.{ts,vue}";

export const imports: Codemod = {
  name: "imports",
  version: "0.3.0",
  description: "Rewrites ../ imports between kind folders to #nuxvel/schema, #nuxvel/factories, #server/*, #shared/*, ~/* and #layers/<name>/*",
  files: [folders, `layers/*/${folders}`],
  rewrite: ruleRewrite("no-parent-imports"),
};
