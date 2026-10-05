import { describe, it } from "vitest";
import { expect, field, text, trpcSpy, visit } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("trpcSpy(page, path)", async () => {
  await setupPlayground({ browser: true });

  it("records the input of each browser call, and not the call of the server rendering", async () => {
    const page = await visit("/_post-search");
    const list = trpcSpy(page, "post.list");

    await field(page, "Search").pressSequentially("hello", { delay: 50 });

    await expect(list).toHaveBeenCalledWith({ q: "hello" });
    await expect(text(page, "0 posts")).toBeVisible();
    await expect(list).toHaveBeenCalledTimes(1);
    await expect(list).not.toHaveBeenCalledWith({ q: "" });
  });
});
