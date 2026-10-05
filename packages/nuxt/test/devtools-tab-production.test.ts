import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("the nuxvel DevTools tab outside development", async () => {
  await setupPlayground();

  it("is not mounted at all", async () => {
    for (const path of ["/_nuxvel/devtools", "/_nuxvel/devtools/", "/_nuxvel/devtools/api/stream"]) {
      const response = await guest().fetch(path);

      expect(response.status, path).toBe(404);
    }
  });

  it("has no mail preview to render with", async () => {
    const response = await guest().fetch("/_nuxvel/devtools/api/mail-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "welcome", input: { to: "someone@example.com", name: "Ada" } }),
    });

    expect(response.status).toBe(404);
  });

  it("has no route for browser problems", async () => {
    const response = await guest().fetch("/_nuxvel/devtools/api/browser-problems", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "error", message: "Error: boom", path: "/" }),
    });

    expect(response.status).toBe(404);
  });
});
