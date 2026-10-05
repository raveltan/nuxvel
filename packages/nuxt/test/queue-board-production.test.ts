import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("the queue dashboard outside development", async () => {
  await setupPlayground();

  it("is not mounted at all", async () => {
    const response = await guest().fetch("/_nuxvel/queue");

    expect(response.status).toBe(404);
  });
});
