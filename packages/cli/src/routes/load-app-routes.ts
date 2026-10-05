import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { type AppRoutes, appRoutesSchema } from "@nuxvel/nuxt/cli";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { error } from "../ui/output.ts";

const execFileAsync = promisify(execFile);

export function loadAppRoutes(cwd: string): Promise<AppRoutes | undefined> {
  return loadFromApp(cwd, (outFile) => ({ kind: "routes", outFile }), appRoutesSchema);
}

export async function loadAppRoutesAt(cwd: string, ref: string): Promise<AppRoutes | undefined> {
  const dir = await mkdtemp(join(cwd, ".nuxvel-routes-diff-"));

  try {
    await execFileAsync("git", ["archive", "--output", join(dir, "app.tar"), `${ref}:./`], { cwd });
  } catch (failure) {
    await rm(dir, { recursive: true, force: true });
    error(`Could not read the app at ${ref} from git`, failure instanceof Error ? failure.message.trim() : undefined);
    return undefined;
  }

  try {
    await execFileAsync("tar", ["-xf", "app.tar"], { cwd: dir });
    return await loadAppRoutes(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
