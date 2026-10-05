import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("defineEvent", async () => {
  await setupPlayground();

  it("parses a valid payload and throws the Phase-4 shape on an invalid one", async () => {
    const body = await guest().$fetch("/api/_define-event-check");

    expect(body.name).toBe("_probe.happened");
    expect(body.parsed).toEqual({ name: "Hello", count: 3 });
    expect(body.invalidThrew).toBe(true);
    expect(Object.keys(body.fields)).toEqual(
      expect.arrayContaining(["name", "count"]),
    );
  });
});
