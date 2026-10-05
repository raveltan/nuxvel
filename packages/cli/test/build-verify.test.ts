import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "@nuxvel/test-helpers/run";
import { runCliAt, stripAnsi } from "./helpers/run.ts";

async function runCli(cwd: string, ...args: string[]) {
  const { stdout, stderr, exitCode } = await runCliAt(cwd, ...args);
  return { output: stripAnsi(stdout + stderr), exitCode };
}

describe("nuxvel build:verify", () => {
  let scratchDir: string;
  let releaseDir: string;

  function writeChecksum(archive: string) {
    const checksum = createHash("sha256").update(readFileSync(archive)).digest("hex");
    writeFileSync(`${archive}.sha256`, `${checksum}  ${archive.split("/").pop()}\n`);
  }

  async function packTar(archive: string) {
    const packed = await run("tar", ["-czf", archive, "-C", releaseDir, "."], scratchDir);
    expect(packed.exitCode, packed.output).toBe(0);
    writeChecksum(archive);
    return archive;
  }

  function packZip(archive: string) {
    writeFileSync(
      archive,
      zipSync({
        "nuxvel-manifest.json": readFileSync(join(releaseDir, "nuxvel-manifest.json")),
        ".output/server/index.mjs": readFileSync(join(releaseDir, ".output/server/index.mjs")),
      }),
    );
    writeChecksum(archive);
    return archive;
  }

  beforeAll(async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-verify-"));
    releaseDir = join(scratchDir, "release");
    mkdirSync(join(releaseDir, ".output", "server"), { recursive: true });
    writeFileSync(join(releaseDir, "package.json"), JSON.stringify({ name: "verify-app", version: "1.4.0" }));
    writeFileSync(join(releaseDir, ".output", "server", "index.mjs"), "console.log('serving');\n");

    const described = await runCli(releaseDir, "build:manifest");
    expect(described.exitCode, described.output).toBe(0);
  });

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("passes an untouched archive built for this machine, tar or zip", async () => {
    for (const archive of [
      await packTar(join(scratchDir, "untouched.tar.gz")),
      packZip(join(scratchDir, "untouched.zip")),
    ]) {
      const { output, exitCode } = await runCli(scratchDir, "build:verify", archive);

      expect(exitCode, output).toBe(0);
      expect(output).toContain(`✔ ${archive} verified: verify-app`);

      const json = await runCliAt(scratchDir, "build:verify", archive, "--json");

      expect(json.exitCode, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout)).toEqual({
        archive,
        ok: true,
        manifest: expect.objectContaining({ app: "verify-app", platform: process.platform, arch: process.arch }),
      });
    }
  });

  it("fails a tampered archive on its checksum", async () => {
    const archive = await packTar(join(scratchDir, "tampered.tar.gz"));
    const bytes = readFileSync(archive);
    bytes.writeUInt8((bytes.at(-1) ?? 0) ^ 0xff, bytes.length - 1);
    writeFileSync(archive, bytes);

    const { output, exitCode } = await runCli(scratchDir, "build:verify", archive);

    expect(exitCode).toBe(1);
    expect(output).toContain(`✖ ${archive} failed verification`);
    expect(output).toContain("checksum mismatch");

    const json = await runCliAt(scratchDir, "build:verify", archive, "--json");

    expect(json.exitCode).toBe(1);
    expect(JSON.parse(json.stdout)).toEqual({
      archive,
      ok: false,
      problems: [expect.stringMatching(/^checksum mismatch: /)],
    });
  });

  it("fails an archive without its checksum file", async () => {
    const archive = await packTar(join(scratchDir, "unchecked.tar.gz"));
    rmSync(`${archive}.sha256`);

    const { output, exitCode } = await runCli(scratchDir, "build:verify", archive);

    expect(exitCode).toBe(1);
    expect(output).toContain("unchecked.tar.gz.sha256 is missing");
  });

  it("fails an archive built for another architecture or Node major", async () => {
    const manifestPath = join(releaseDir, "nuxvel-manifest.json");
    const original = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(original);
    const otherArch = process.arch === "arm64" ? "x64" : "arm64";
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, arch: otherArch, node: "18.20.0" }));

    try {
      const archive = await packTar(join(scratchDir, "foreign.tar.gz"));

      const { output, exitCode } = await runCli(scratchDir, "build:verify", archive);

      expect(exitCode).toBe(1);
      expect(output).toContain(`built for ${process.platform}/${otherArch}, this machine is ${process.platform}/${process.arch}`);
      expect(output).toContain(`built with Node 18.20.0, this machine runs Node ${process.versions.node}`);
    } finally {
      writeFileSync(manifestPath, original);
    }
  });
});
