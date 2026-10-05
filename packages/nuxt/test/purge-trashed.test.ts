import { fileURLToPath } from "node:url";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

const playground = fileURLToPath(new URL("../../../playground", import.meta.url));

async function schedulesModule(purgeTrashedAfter?: string) {
  const nuxt = await loadNuxt({
    cwd: playground,
    ready: false,
    overrides: {
      _prepare: true,
      buildDir: `${playground}/.nuxvel-test-purge-trashed`,
      nuxvel: { database: { purgeTrashedAfter } },
    },
  });

  try {
    await nuxt.ready();
    const template = nuxt.options.build.templates.find((entry) => entry.filename === "nuxvel/schedules.ts");

    // the nuxvel templates read the file system and never the template context
    return String(await template?.getContents?.({} as never));
  } finally {
    await nuxt.close();
  }
}

describe("purging trashed rows", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_purge-trashed-check");

  it("deletes nothing while purgeTrashedAfter is unset", () => {
    expect(probe().withoutSetting).toEqual({});
    expect(probe().afterNoop).toEqual(["live", "trashed long ago", "trashed today"]);
  });

  it("deletes rows trashed longer ago than the interval, in every table with softDeletes()", () => {
    expect(probe().purged).toEqual({ posts: 1 });
    expect(probe().remaining).toEqual(["live", "trashed today"]);
  });

  it("registers the nuxvel.purge-trashed schedule only when purgeTrashedAfter is set", async () => {
    expect(await schedulesModule()).not.toContain("purge-trashed");
    expect(await schedulesModule("30 days")).toContain("purge-trashed");
  }, 120_000);
});
