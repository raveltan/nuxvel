import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("transaction()", async () => {
  await setupPlayground();

  it("rolls back a nested plain function's write via async-context useDb()", async () => {
    const body = await guest().$fetch("/api/_transaction-rollback-check");
    expect(body.after).toBe(body.before);
  });

  it("rolls back only the inner savepoint when its rejection is caught", async () => {
    const body = await guest().$fetch("/api/_transaction-savepoint-check");
    expect(body).toMatchObject({
      count: 1,
      hasOuterRow: true,
    });
  });

  it("routes useDb().transaction through transaction(), so useDb() inside it joins it and onCommit waits for the commit", async () => {
    const body = await guest().$fetch("/api/_db-transaction-check");
    expect(body).toMatchObject({
      rowsAfterRollback: 0,
      rowsAfterCommit: 1,
      firedInsideTransaction: 0,
    });
    expect(body.fired).toEqual(["committed"]);
  });

  it("awaits an async onCommit or beforeCommit hook outside a transaction", async () => {
    const body = await guest().$fetch("/api/_commit-hooks-outside-transaction-check");
    expect(body.ran).toEqual(["beforeCommit", "onCommit"]);
  });
});
