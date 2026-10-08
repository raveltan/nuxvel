import { readFileSync } from "node:fs";
import type { Discovery, DiscoveredFolder } from "./discovery";
import type { GeneratedModule } from "./generated-modules";
import type { RuntimeFile } from "./resolved-options";

interface PublicImport {
  name: string;
  kind: string;
  side: string;
  file: string;
}

const NAMED_DEFINITIONS: [kind: string, folder: DiscoveredFolder][] = [
  ["action", "actions"],
  ["job", "jobs"],
  ["mail", "mail"],
  ["channel", "channels"],
  ["event", "events"],
  ["notification", "notifications"],
  ["seeder", "seeders"],
];

function serverValues(runtimeFile: RuntimeFile) {
  const entries = JSON.parse(readFileSync(runtimeFile("./public-imports.json"), "utf8")) as PublicImport[];
  const byFile = new Map<string, string[]>();

  for (const { name, kind, side, file } of entries) {
    if (side !== "server" || kind !== "value") continue;
    const path = runtimeFile(`./${file.replace(/\.ts$/, "")}`);
    byFile.set(path, [...(byFile.get(path) ?? []), name]);
  }

  return byFile;
}

async function definitionFiles({ discover, discoverNamed }: Discovery) {
  const named = await Promise.all(
    NAMED_DEFINITIONS.map(async ([kind, folder]) => (await discoverNamed(kind, folder)).map(({ file }) => file)),
  );

  return [...named.flat(), ...(await discover("policies"))];
}

/**
 * Builds `#nuxvel/tinker-scope`: one object that holds every server value
 * of `public-imports.json` under its own name, and every export of the
 * discovered actions, jobs, mails, channels, events, notifications,
 * policies and seeders under its export name. `nuxvel tinker` puts it in
 * scope. The `default` export of a definition file is left out.
 */
export function tinkerScopeModule(discovery: Discovery, runtimeFile: RuntimeFile): Record<string, GeneratedModule> {
  const values = serverValues(runtimeFile);

  return {
    "#nuxvel/tinker-scope": async () => {
      const files = await definitionFiles(discovery);
      const imports: string[] = [];
      const entries: string[] = [];

      [...values].forEach(([path, names], index) => {
        imports.push(`import * as public${index} from ${JSON.stringify(path)};`);
        entries.push(...names.map((name) => `[${JSON.stringify(name)}, public${index}.${name}]`));
      });
      files.forEach((file, index) => imports.push(`import * as definition${index} from ${JSON.stringify(file)};`));

      return `${imports.join("\n")}

const scope = Object.fromEntries([
  ${entries.join(",\n  ")},
  ...[${files.map((_, index) => `definition${index}`).join(", ")}].flatMap((definition) => Object.entries(definition).filter(([name]) => name !== "default")),
]);

export default scope;
`;
    },
  };
}
