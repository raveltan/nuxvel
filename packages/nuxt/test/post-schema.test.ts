import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("shared/schemas/post.ts", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_post-schema-check");

  it("createPostInput accepts valid input and rejects invalid input", async () => {
    const body = probe();

    expect(body.validCreateSucceeded).toBe(true);
    expect(Object.keys(body.invalidCreateError.fields)).toEqual(
      expect.arrayContaining(["title"]),
    );
  });

  it("updatePostInput accepts valid input and rejects invalid input", async () => {
    const body = probe();

    expect(body.validUpdateSucceeded).toBe(true);
    expect(Object.keys(body.invalidUpdateError.fields)).toEqual(
      expect.arrayContaining(["id", "title"]),
    );
  });
});
