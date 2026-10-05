import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("audit hash chain", async () => {
  await setupPlayground();

  it("verifies an untampered chain clean and reports the first tampered or missing row", async () => {
    const body = await guest().$fetch("/api/_audit-chain-check");
    const [, , third, fourth] = body.ids;

    expect(body.intact).toEqual({ checked: 4 });
    expect(body.oldestRemoved).toEqual({ checked: 3 });
    expect(body.tampered).toEqual({ checked: 1, firstBreak: { id: third, reason: "modified" } });
    expect(body.removed).toEqual({ checked: 1, firstBreak: { id: fourth, reason: "unlinked" } });
  });

  it("refuses UPDATE and DELETE on audit_log and its partitions, and keys the chain so a recomputed SHA-256 chain fails", async () => {
    const body = await guest().$fetch("/api/_audit-chain-forgery-check");
    const [first] = body.ids;

    expect(body.intact).toEqual({ checked: 2 });
    for (const error of [body.updateError, body.deleteError, body.partitionUpdateError]) {
      expect(error).toContain("audit_log is append-only");
    }
    expect(body.afterAuthRotation).toEqual({ checked: 2 });
    expect(body.forged).toEqual({ checked: 0, firstBreak: { id: first, reason: "modified" } });
  });

  it("reports a swapped audit subject and a forged audit context, refuses one without a MAC, and still verifies after an erasure", async () => {
    const body = await guest().$fetch("/api/_audit-attribution-check");

    expect(body.intact).toEqual({ checked: 2 });
    expect(body.restored).toEqual({ checked: 2 });
    expect(body.erased).toEqual({ checked: 2 });
    expect(body.swapped).toEqual({
      checked: 2,
      firstBreak: { id: [...body.subjectIds].sort()[0], reason: "subject-modified" },
    });
    expect(body.forgedContext).toEqual({
      checked: 2,
      firstBreak: { id: body.aliceEntryId, reason: "context-modified" },
    });
    expect(body.unsigned).toContain("audit_context_mac_present");
  });
});
