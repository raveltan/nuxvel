import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { zipSync, type Zippable } from "fflate";
import { create } from "tar";

export type ArchiveFormat = "tar" | "zip";

const UNIX = 3;

function zipEntries(dir: string, prefix = ""): Zippable {
  const entries: Zippable = {};

  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const entry = `${prefix}${name}`;
    const stats = lstatSync(path);

    if (stats.isDirectory()) {
      Object.assign(entries, zipEntries(path, `${entry}/`));
    } else if (stats.isSymbolicLink()) {
      entries[entry] = [
        new TextEncoder().encode(readlinkSync(path)),
        { os: UNIX, attrs: (0o120000 | 0o777) << 16, level: 0 },
      ];
    } else {
      entries[entry] = [readFileSync(path), { os: UNIX, attrs: (stats.mode & 0o177777) << 16 }];
    }
  }

  return entries;
}

async function packTar(dir: string, file: string) {
  await create({ gzip: true, portable: true, file, cwd: dir }, readdirSync(dir));
}

function packZip(dir: string, file: string) {
  writeFileSync(file, zipSync(zipEntries(dir)));
}

/**
 * Packs every file in `dir` into `file` — a gzipped tarball or a zip,
 * both keeping file modes and symlinks — and writes its SHA-256 next to
 * it as `<file>.sha256`, in `sha256sum` format.
 */
export async function packArchive(dir: string, file: string, format: ArchiveFormat) {
  if (format === "zip") packZip(dir, file);
  else await packTar(dir, file);

  const checksum = createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(`${file}.sha256`, `${checksum}  ${basename(file)}\n`);
}
