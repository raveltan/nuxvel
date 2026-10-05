import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./list-files";

const nuxtSrc = (dir: string) => fileURLToPath(new URL(`../../src/${dir}`, import.meta.url));
const cliSrc = fileURLToPath(new URL("../../../cli/src", import.meta.url));

export interface CopiedHelperRule {
  use: string;
  dir: string;
  home: string;
  pattern: RegExp;
  sample: string;
}

export const RULES: CopiedHelperRule[] = [
  {
    use: "shellQuote() of server/shell-script.ts",
    dir: cliSrc,
    home: "server/shell-script.ts",
    pattern: /function shellQuote\b|replaceAll\(\s*["']'["']\s*,/,
    sample: "function shellQuote(value: string) {\n  return `'${value}'`;\n}",
  },
  {
    use: "sshTarget() of server/run-over-ssh.ts",
    dir: cliSrc,
    home: "server/run-over-ssh.ts",
    pattern: /knownHosts:\s*knownHostsPath\(/,
    sample: 'const target = { host: server.host, user: "root", knownHosts: knownHostsPath(cwd) };',
  },
  {
    use: "spawnSsh() or runOverSsh() of server/run-over-ssh.ts",
    dir: cliSrc,
    home: "server/run-over-ssh.ts",
    pattern: /spawn\(\s*["']ssh["']/,
    sample: 'const child = spawn("ssh", [destination], { stdio: "inherit" });',
  },
  {
    use: "plural() of ui/output.ts",
    dir: cliSrc,
    home: "ui/output.ts",
    pattern: /=== 1 \? "" : "s"|!== 1 \? "s" : ""/,
    sample: 'const label = `${count} file${count === 1 ? "" : "s"}`;',
  },
  {
    use: "errorMessage() of error-message.ts",
    dir: cliSrc,
    home: "error-message.ts",
    pattern: /instanceof Error \? \w+\.message : String\(/,
    sample: "const message = error instanceof Error ? error.message : String(error);",
  },
  {
    use: "errorMessage() of errors/error-message.ts",
    dir: nuxtSrc("runtime/server"),
    home: "errors/error-message.ts",
    pattern: /instanceof Error \? (\w+)\.message : (?:String\(\1\)|\1\b)/,
    sample: "const message = error instanceof Error ? error.message : error;",
  },
  {
    use: "sameText() of security/same-text.ts",
    dir: nuxtSrc("runtime/server"),
    home: "security/same-text.ts",
    pattern: /\btimingSafeEqual\b/,
    sample: 'import { timingSafeEqual } from "node:crypto";',
  },
  {
    use: "currentEvent() of server/utils/current-event.ts",
    dir: nuxtSrc("runtime"),
    home: "server/utils/current-event.ts",
    pattern: /try\s*\{\s*(?:return\s+)?[^;{}]*\buseEvent\(\)[^;{}]*;(?:\s*return\s+true;)?\s*\}\s*catch\s*(?:\([^)]*\)\s*)?\{\s*return\b/,
    sample: 'function key() {\n  try {\n    return getRequestHeader(useEvent(), "x-key");\n  } catch {\n    return undefined;\n  }\n}',
  },
  {
    use: "the AST helpers of ast.ts",
    dir: nuxtSrc("eslint/rules"),
    home: "ast.ts",
    pattern: /RuleListener\[["']CallExpression["']\]|\bfunction\s+(?:calleeName|staticText)\s*\(|\btype\s+(?:TemplateAttribute|TemplateElement)\s*=/,
    sample: "function calleeName(node: CallExpression) {\n  return node.callee.type;\n}",
  },
];

export function findCopiedHelpers(rules: CopiedHelperRule[] = RULES): string[] {
  return rules.flatMap(({ use, dir, home, pattern }) =>
    listFiles(dir)
      .filter((path) => path.endsWith(".ts"))
      .map((path) => relative(dir, path).replaceAll("\\", "/"))
      .filter((file) => file !== home && pattern.test(readFileSync(`${dir}/${file}`, "utf8")))
      .map((file) => `${file}: use ${use}`),
  );
}
