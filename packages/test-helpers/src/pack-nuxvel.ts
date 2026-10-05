import { cpSync, existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./run";

const repoDir = fileURLToPath(new URL("../../..", import.meta.url));

async function runOrThrow(command: string, args: string[], cwd: string) {
  const result = await run(command, args, cwd);
  if (result.exitCode !== 0) throw new Error(`${command} ${args.join(" ")} failed in ${cwd}:\n${result.output}`);
  return result;
}

async function copyWorkingTree(from: string, to: string) {
  const listed = await runOrThrow("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], from);
  for (const file of listed.stdout.split("\0").filter((file) => file && !file.startsWith("test/") && existsSync(join(from, file)))) {
    mkdirSync(dirname(join(to, file)), { recursive: true });
    cpSync(join(from, file), join(to, file));
  }
}

export async function packNuxvel(scratchDir: string) {
  const vendorDir = join(scratchDir, "vendor");
  const nuxtCopy = join(scratchDir, "nuxvel-src", "packages", "nuxt");
  mkdirSync(vendorDir, { recursive: true });

  // @nuxvel/nuxt's prepare builds into dist/, so it packs from a copy to leave the workspace's stub build alone
  await copyWorkingTree(join(repoDir, "packages", "nuxt"), nuxtCopy);
  cpSync(join(repoDir, "tsconfig.base.json"), join(scratchDir, "nuxvel-src", "tsconfig.base.json"));
  symlinkSync(join(repoDir, "packages", "nuxt", "node_modules"), join(nuxtCopy, "node_modules"));
  symlinkSync(join(repoDir, "node_modules"), join(scratchDir, "nuxvel-src", "node_modules"));

  for (const packageDir of [nuxtCopy, join(repoDir, "packages", "cli")]) {
    await runOrThrow("npm", ["pack", "--pack-destination", vendorDir], packageDir);
  }

  const [cliTarball, nuxtTarball] = readdirSync(vendorDir).sort();
  if (!cliTarball || !nuxtTarball) throw new Error(`npm pack wrote ${readdirSync(vendorDir).join(", ")} into ${vendorDir}`);
  return { vendorDir, nuxt: nuxtTarball, cli: cliTarball };
}
