import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NuxvelCommand } from "@nuxvel/nuxt/cli";
import { runCommandInApp } from "./run-in-app.ts";

export async function loadFromApp<T>(
  cwd: string,
  command: (outFile: string) => NuxvelCommand,
  schema: { parse(value: unknown): T },
): Promise<T | undefined> {
  const dir = await mkdtemp(join(tmpdir(), "nuxvel-command-"));
  const outFile = join(dir, "result.json");

  try {
    if ((await runCommandInApp(cwd, command(outFile))) !== 0) return undefined;

    return schema.parse(JSON.parse(await readFile(outFile, "utf8")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
