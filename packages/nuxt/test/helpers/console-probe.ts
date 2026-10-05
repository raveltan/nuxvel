import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";

export const CONSOLE_PROBE_MESSAGE = "console probe mounted";

export function consoleProbeChunk(outputDir: string) {
  const assets = join(outputDir, "public", "_nuxt");
  const chunks = readdirSync(assets)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(assets, file), "utf8"))
    .filter((source) => source.includes("Console probe page"));

  expect(chunks).toHaveLength(1);

  return chunks[0] ?? "";
}
