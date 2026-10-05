import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { defineBackfill } from "../src/runtime/server/backfills/define-backfill";
import { setupPlayground } from "./helpers/playground";

describe("defineBackfill", async () => {
  await setupPlayground();

  it("resumes an interrupted backfill from its last committed cursor, given its name or its definition", async () => {
    const body = await guest().$fetch("/api/_backfill-check");

    expect(body.crash).toBe("probe backfill crashed");
    expect(body.afterCrash).toEqual({
      cursor: body.ids[1],
      processed: 2,
      total: 5,
      completed: false,
    });
    expect(body.afterResume).toEqual({
      cursor: body.ids[4],
      processed: 5,
      total: 5,
      completed: true,
    });
    expect(body.names).toEqual([
      "backfill-1+",
      "backfill-2+",
      "backfill-3+",
      "backfill-4+",
      "backfill-5+",
    ]);
  });

  it.for([0, -1, 2.5, Number.NaN])("rejects a batchSize of %s", (batchSize) => {
    expect(() =>
      defineBackfill({ table: postsTable, batchSize, async handler() {} }),
    ).toThrow(`defineBackfill: batchSize must be a positive integer, got ${batchSize}.`);
  });
});
