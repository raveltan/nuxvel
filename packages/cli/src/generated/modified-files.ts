import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hash, readManifest } from "./manifest.ts";

type GeneratedStatus = "modified" | "missing";

export function modifiedFiles(cwd: string) {
  return Object.entries(readManifest(cwd)).flatMap(([path, entry]): { path: string; status: GeneratedStatus }[] => {
    const file = join(cwd, path);

    if (!existsSync(file)) return [{ path, status: "missing" }];

    return hash(readFileSync(file, "utf8")) === entry.hash ? [] : [{ path, status: "modified" }];
  });
}
