import type { Codemod } from "../codemod.ts";

const RENAMED: Record<string, string> = {
  test: "test:functional",
  channels: "channel:list",
  events: "event:list",
  routes: "route:list",
  releases: "release:list",
  "flags:list": "flag:list",
  "flags:set": "flag:set",
  "flags:stale": "flag:stale",
  "push:keys": "key:push",
};

const OLD_COMMAND = /(\bnuxvel|(?:\.\/|(?<![\w./-]))nv) (test|channels|events|routes|releases|flags:(?:list|set|stale)|push:keys)(?![\w:-])/g;

export const cliNames: Codemod = {
  name: "cli-names",
  version: "0.3.0",
  description:
    "Rewrites the renamed nuxvel commands, also run through ./nv or nv, in package.json, the GitHub workflows and the Dockerfile: test becomes test:functional, channels, events, routes and releases become channel:list, event:list, route:list and release:list, flags:* becomes flag:* and push:keys becomes key:push",
  files: ["package.json", ".github/workflows/*.{yml,yaml}", "Dockerfile"],
  rewrite: (source) => ({ output: source.replace(OLD_COMMAND, (_match, cli: string, command: string) => `${cli} ${RENAMED[command] ?? command}`), manual: [] }),
};
