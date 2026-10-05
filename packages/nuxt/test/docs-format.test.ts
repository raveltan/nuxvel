import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export const UNWRAPPED_DOCS = [
  "README.md",
  "docs/actions.md",
  "docs/api.md",
  "docs/audit.md",
  "docs/auth.md",
  "docs/authorization.md",
  "docs/auto-imports.md",
  "docs/backfills.md",
  "docs/billing.md",
  "docs/build.md",
  "docs/cache.md",
  "docs/cli.md",
  "docs/create.md",
  "docs/database.md",
  "docs/devtools.md",
  "docs/events.md",
  "docs/flags.md",
  "docs/frontend.md",
  "docs/i18n.md",
  "docs/index.md",
  "docs/mail.md",
  "docs/maintenance.md",
  "docs/modules.md",
  "docs/notifications.md",
  "docs/observability.md",
  "docs/openapi.md",
  "docs/privacy.md",
  "docs/pwa.md",
  "docs/queues.md",
  "docs/realtime.md",
  "docs/redis.md",
  "docs/rendering.md",
  "docs/search.md",
  "docs/security.md",
  "docs/seo.md",
  "docs/soft-deletes.md",
  "docs/storage.md",
  "docs/testing.md",
  "docs/tutorials/component-driven-ui.md",
  "docs/tutorials/course-platform.md",
  "docs/tutorials/first-app.md",
  "docs/tutorials/invoices.md",
  "docs/tutorials/orders.md",
  "docs/tutorials/realtime.md",
  "docs/tutorials/recipe-site.md",
  "docs/tutorials/ship-and-run.md",
  "docs/tutorials/testing-in-depth.md",
  "docs/tutorials/theming.md",
  "docs/validation.md",
  "docs/webhooks.md",
  "packages/create/template/README.md",
];

const fence = /^\s*(```|~~~)/;
const blockStart = /^\s*(#|\||<|>|([-*+]|\d+[.)])\s|```|~~~|\[[^\]]+\]:\s)/;

function markdownFiles() {
  const docs = readdirSync(join(repoRoot, "docs"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".md"))
    .map((file) => `docs/${file}`);

  return [...docs, "README.md", "packages/create/template/README.md"].filter((file) =>
    existsSync(join(repoRoot, file)),
  );
}

function wrappedLines(source: string) {
  const lines = source.split("\n");
  const found: number[] = [];
  let open: string | undefined;
  let skipBlock = false;
  let start = 0;

  if (lines[0] === "---") {
    start = lines.indexOf("---", 1) + 1;
  }

  for (let index = start; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    const marker = fence.exec(line)?.[1];

    if (open) {
      if (line.trim().startsWith(open) && line.trim().replaceAll(open[0] ?? "", "") === "") {
        open = undefined;
      }
      continue;
    }
    if (marker) {
      open = marker;
      continue;
    }
    if (!line.trim()) {
      skipBlock = false;
      continue;
    }
    if (skipBlock || /^\s*(#|\||<|\[[^\]]+\]:\s)/.test(line)) {
      skipBlock = skipBlock || /^\s*(\||<)/.test(line);
      continue;
    }
    if (!next.trim()) {
      continue;
    }
    const quoted = line.trimStart().startsWith(">");
    const continues = quoted
      ? next.trimStart().startsWith(">") && !blockStart.test(next.trimStart().slice(1)) && next.trimStart().slice(1).trim() !== ""
      : !blockStart.test(next);

    if (continues) {
      found.push(index + 1);
    }
  }

  return found;
}

describe("docs format", () => {
  it("flags a paragraph that spans two lines", () => {
    expect(wrappedLines("# Title\n\nOne sentence\nwraps here.\n\n- item\n  wraps too\n")).toEqual([3, 6]);
  });

  it("ignores fences, tables, html and one-line blocks", () => {
    expect(
      wrappedLines("One line.\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\n| a |\n| - |\n\n<div>\nx\n</div>\n\n- one\n- two\n"),
    ).toEqual([]);
  });

  it("keeps every paragraph on one line", () => {
    const unwrapped = new Set(UNWRAPPED_DOCS);
    const offenders = markdownFiles()
      .filter((file) => unwrapped.has(file))
      .flatMap((file) => wrappedLines(readFileSync(join(repoRoot, file), "utf8")).map((line) => `${file}:${line}`));

    expect(offenders).toEqual([]);
  });
});
