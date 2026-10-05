import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isStub(dist) {
  try {
    return readFileSync(`${dist}/module.mjs`, "utf8").includes("createJiti");
  } catch {
    return false;
  }
}

const dist = fileURLToPath(new URL("../dist", import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url) && !isStub(dist)) {
  const { status } = spawnSync("npx", ["nuxt-module-build", "build", "--stub"], { stdio: "inherit" });
  process.exit(status ?? 1);
}
