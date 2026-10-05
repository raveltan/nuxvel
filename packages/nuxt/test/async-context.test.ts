import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("nitro asyncContext", async () => {
  await setupPlayground();

  it("keeps an AsyncLocalStorage value readable after an await", async () => {
    const body = await guest().$fetch("/api/_async-context-check");
    expect(body).toEqual({ value: "before-await" });
  });
});
