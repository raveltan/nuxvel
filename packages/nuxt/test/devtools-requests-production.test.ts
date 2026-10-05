import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("the Requests panel outside development", async () => {
  await setupPlayground();

  it("adds no debug headers to a page or a procedure call", async () => {
    for (const path of ["/_requests-panel", "/api/trpc/_requestsPanelCheck.load"]) {
      const response = await guest().fetch(path);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-nuxvel-debug-id")).toBeNull();
      expect(response.headers.get("server-timing")).toBeNull();
    }
  });

  it("has no entry route", async () => {
    expect((await guest().fetch("/_nuxvel/devtools/api/entries/anything")).status).toBe(404);
  });
});
