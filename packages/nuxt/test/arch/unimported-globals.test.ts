import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { findUnimportedGlobals } from "./unimported-globals";

function scratchRuntime(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));

  for (const [file, source] of Object.entries(files)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), source);
  }

  return dir;
}

describe("arch: runtime files import every Nitro, h3 and Nuxt helper they use", () => {
  it("finds none in the real runtime tree", () => {
    expect(findUnimportedGlobals()).toEqual([]);
  }, 30_000);

  it.for([
    ["server/routes/live.ts", 'export default defineEventHandler(() => "live");', "defineEventHandler"],
    ["server/plugins/boot.ts", "export default defineNitroPlugin(() => {});", "defineNitroPlugin"],
    ["server/utils/config.ts", "export const config = () => useRuntimeConfig();", "useRuntimeConfig"],
    ["server/utils/db.ts", "export const ready = () => useDb();", "useDb"],
    ["app/plugins/boot.ts", "export default defineNuxtPlugin(() => {});", "defineNuxtPlugin"],
  ] as const)("flags %s using %s without importing it", ([file, source, name]) => {
    const dir = scratchRuntime({ [file]: source });

    try {
      expect(findUnimportedGlobals(dir)).toEqual([`${file}:1 ${name}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts the same helpers once they are imported", () => {
    const dir = scratchRuntime({
      "server/routes/live.ts": 'import { defineEventHandler } from "h3";\nexport default defineEventHandler(() => "live");',
      "server/plugins/boot.ts": 'import { defineNitroPlugin } from "nitropack/runtime";\nexport default defineNitroPlugin(() => {});',
      "app/components/Box.vue": '<script setup lang="ts" generic="T">\nimport { ref } from "vue";\nconst props = defineProps<{ value: T }>();\nconst open = ref(props.value);\n</script>',
    });

    try {
      expect(findUnimportedGlobals(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
