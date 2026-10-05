import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listFiles } from "./list-files";

const RUNTIME_SERVER_DIR = fileURLToPath(
  new URL("../../src/runtime/server", import.meta.url),
);

const AUDIT_READER = fileURLToPath(
  new URL("../../src/runtime/server/audit/audit-reader.ts", import.meta.url),
);

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function findDatabaseOwnerUrlReferences(
  dir: string = RUNTIME_SERVER_DIR,
): string[] {
  return listFiles(dir)
    .filter((path) => path.endsWith(".ts") && path !== AUDIT_READER)
    .filter((path) => withoutComments(readFileSync(path, "utf8")).includes("DATABASE_OWNER_URL"));
}
