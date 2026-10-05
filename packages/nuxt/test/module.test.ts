import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("@nuxvel/nuxt module", async () => {
  await setupPlayground();

  it("responds 200 on /", async () => {
    const response = await guest().fetch("/");
    expect(response.status).toBe(200);
  });
});
