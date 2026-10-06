import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("defineAction", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_define-action-check");

  it("passes valid input through, parses a transforming schema once, and throws the Phase-4 shape on invalid input", () => {
    const body = probe();

    expect(body.valid).toEqual({ name: "Ravel", age: 30 });
    expect(body.transformed).toEqual(["news", "tech"]);
    expect(body.invalidThrew).toBe(true);
    expect(Object.keys(body.fields)).toEqual(
      expect.arrayContaining(["name", "age"]),
    );
  });

  it("takes an empty object or undefined when the action declares no input", () => {
    expect(probe().withoutInput).toEqual([{}, "undefined"]);
  });

  it("validates a schema with an async refinement", () => {
    expect(probe()).toMatchObject({
      claimed: "ravel",
      refusedFields: { handle: ["That handle is taken"] },
    });
  });
});
