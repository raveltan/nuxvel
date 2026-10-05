import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const playgroundDir = join(repoRoot, "playground");

export function scratchAppDir(label: string) {
  return join(repoRoot, `.nuxvel-test-${label}-${randomUUID().slice(0, 8)}`);
}

export function createScratchApp(appDir: string) {
  mkdirSync(join(appDir, "app"), { recursive: true });
  symlinkSync(join(repoRoot, "node_modules"), join(appDir, "node_modules"));
  cpSync(join(playgroundDir, "nuxt.config.ts"), join(appDir, "nuxt.config.ts"));
  cpSync(join(playgroundDir, "server/database/schema"), join(appDir, "server/database/schema"), {
    recursive: true,
  });
  writeFileSync(join(appDir, "app", "app.vue"), "<template><div /></template>\n");
}

export function removeScratchApp(appDir: string) {
  rmSync(appDir, { recursive: true, force: true });
}
