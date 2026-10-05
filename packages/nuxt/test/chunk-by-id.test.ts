import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("chunkById()", async () => {
  await setupPlayground();

  it("walks the matching rows in id order, each row once, in chunks of the size", async () => {
    const { inserted, chunks } = await guest().$fetch<{ inserted: number[]; chunks: number[][] }>("/api/_chunk-by-id-check");

    expect(chunks.map((chunk) => chunk.length)).toEqual([3, 3, 1]);
    expect(chunks.flat()).toEqual(inserted);
  });
});
