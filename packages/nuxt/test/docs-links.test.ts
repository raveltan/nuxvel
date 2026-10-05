import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function markdownFiles() {
  const docs = readdirSync(join(repoRoot, "docs"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".md") && !file.includes("tutorial"))
    .map((file) => join(repoRoot, "docs", file));

  return [...docs, join(repoRoot, "README.md"), join(repoRoot, "packages/create/template/README.md")].filter(
    (file) => existsSync(file),
  );
}

function withoutCode(source: string) {
  return source.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, (span) => (span.includes("](") ? "" : span));
}

function slug(heading: string) {
  return heading
    .trim()
    .toLowerCase()
    .replaceAll("`", "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replaceAll(" ", "-");
}

const anchorCache = new Map<string, Set<string>>();

function anchors(file: string) {
  const cached = anchorCache.get(file);
  if (cached) return cached;

  const found = new Set<string>();
  const seen = new Map<string, number>();
  const source = withoutCode(readFileSync(file, "utf8"));

  for (const [, heading = ""] of source.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = slug(heading);
    const count = seen.get(base);
    found.add(count === undefined ? base : `${base}-${count + 1}`);
    seen.set(base, (count ?? -1) + 1);
  }
  for (const [, id = ""] of source.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) found.add(id);

  anchorCache.set(file, found);
  return found;
}

function brokenLinks(file: string) {
  const broken: string[] = [];
  const source = withoutCode(readFileSync(file, "utf8"));

  for (const [, target = "", hash] of source.matchAll(/\]\(((?:\.{0,2}\/)?[^)#\s:]*)(#[^)\s]+)?\)/g)) {
    if (!target && !hash) continue;

    const linked = target ? resolve(dirname(file), target) : file;
    const name = `${relative(repoRoot, file)} -> ${target}${hash ?? ""}`;

    if (!existsSync(linked)) broken.push(`${name} (missing file)`);
    else if (hash && linked.endsWith(".md") && !anchors(linked).has(decodeURIComponent(hash.slice(1)))) {
      broken.push(`${name} (missing heading)`);
    }
  }

  return broken;
}

describe("docs links", () => {
  it("finds a heading slug the way GitHub renders it", () => {
    expect(slug("`nuxvel make:resource <name>`")).toBe("nuxvel-makeresource-name");
    expect(slug("Soft deletes: purging")).toBe("soft-deletes-purging");
  });

  it("points every relative link at a file and heading that exist", () => {
    expect(markdownFiles().flatMap(brokenLinks)).toEqual([]);
  });
});
