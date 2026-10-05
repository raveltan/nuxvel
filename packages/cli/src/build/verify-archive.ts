import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync } from "fflate";
import { t } from "tar";
import { type BuildManifest, MANIFEST_FILE, describeMachine } from "./build-manifest.ts";

function entryName(path: string) {
  return path.replace(/^\.\//, "");
}

async function readTarManifest(file: string) {
  const chunks: Buffer[] = [];

  await t({
    file,
    filter: (path) => entryName(path) === MANIFEST_FILE,
    onReadEntry: (entry) => entry.on("data", (chunk: Buffer) => chunks.push(chunk)),
  });

  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;
}

function readZipManifest(file: string) {
  const entries = unzipSync(readFileSync(file), {
    filter: (entry) => entryName(entry.name) === MANIFEST_FILE,
  });
  const content = Object.values(entries)[0];

  return content ? new TextDecoder().decode(content) : undefined;
}

function checksum(file: string): { problem: string } | { sha256: string } {
  const checksumFile = `${file}.sha256`;

  if (!existsSync(checksumFile)) return { problem: `${basename(checksumFile)} is missing` };

  const expected = readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");

  return expected === actual ? { sha256: actual } : { problem: `checksum mismatch: expected ${expected}, got ${actual}` };
}

export function machineProblems(
  manifest: BuildManifest,
  machine: ReturnType<typeof describeMachine>,
  name = "this machine",
) {
  const major = (version: string) => version.split(".")[0];
  const problems: string[] = [];

  if (manifest.platform !== machine.platform || manifest.arch !== machine.arch) {
    problems.push(`built for ${manifest.platform}/${manifest.arch}, ${name} is ${machine.platform}/${machine.arch}`);
  }
  if (manifest.libc !== machine.libc) {
    problems.push(`built against ${manifest.libc ?? "no libc"}, ${name} has ${machine.libc ?? "none"}`);
  }
  if (major(manifest.node) !== major(machine.node)) {
    problems.push(`built with Node ${manifest.node}, ${name} runs Node ${machine.node}`);
  }

  return problems;
}

type ArchiveVerification =
  | { ok: true; manifest: BuildManifest }
  | { ok: false; problems: string[] };

/**
 * Checks an archive from `nuxvel build --artifact` before running it
 * here: its `.sha256` checksum matches, and its `nuxvel-manifest.json`
 * was built for this machine's platform, CPU architecture, C library
 * and Node major version.
 */
export async function verifyArchive(file: string): Promise<ArchiveVerification> {
  const archive = await inspectArchive(file);
  if (!archive.ok) return archive;

  const problems = machineProblems(archive.manifest, describeMachine());

  return problems.length > 0 ? { ok: false, problems } : { ok: true, manifest: archive.manifest };
}

export async function inspectArchive(
  file: string,
): Promise<{ ok: true; manifest: BuildManifest; sha256: string } | { ok: false; problems: string[] }> {
  if (!existsSync(file)) return { ok: false, problems: [`${file} does not exist`] };

  const sum = checksum(file);
  if ("problem" in sum) return { ok: false, problems: [sum.problem] };

  const raw = file.endsWith(".zip") ? readZipManifest(file) : await readTarManifest(file);
  if (!raw) return { ok: false, problems: [`${MANIFEST_FILE} is missing from the archive`] };

  return { ok: true, manifest: JSON.parse(raw), sha256: sum.sha256 };
}
