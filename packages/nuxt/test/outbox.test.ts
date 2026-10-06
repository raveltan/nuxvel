import { describe, it } from "vitest";
import postgres from "postgres";
import { expect, guest, useRealQueue } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("the transactional outbox", async () => {
  await setupPlayground();

  useRealQueue();

  it("leaves no row for a rolled-back transaction and survives a crash before the relay", async () => {
    const body = await guest().$fetch("/api/_outbox-check");

    expect(body).toMatchObject({
      afterRollback: 0,
      beforeRelay: 0,
      relayed: 1,
    });
    expect(body.afterRelay).toEqual([
      {
        name: "_probe.record",
        data: { version: 1, payload: { name: "crashed" } },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 604800 },
      },
    ]);
    expect(body).toMatchObject({
      relayedAgain: 0,
      afterSecondRelay: 1,
    });
  });

  it("clears the payload of a row once the relay puts it on the queue", async () => {
    const body = await guest().$fetch("/api/_outbox-check");

    expect(body.relayedDispatched).toBe(true);
    expect(body.relayedPayloads).toEqual([null]);
  });

  it("has written the outbox row once an awaited dispatch() outside a transaction returns", async () => {
    const body = await guest().$fetch("/api/_outbox-outside-transaction-check");

    expect(body.jobNames).toEqual(["_probe.record"]);
  });

  it("indexes only the rows the relay has not dispatched yet", async () => {
    const databaseUrl = process.env.NUXT_DATABASE_URL;
    if (!databaseUrl) throw new Error("NUXT_DATABASE_URL is not set");

    const sql = postgres(databaseUrl, { max: 1 });

    try {
      const rows = await sql<{ indexdef: string }[]>`
        select indexdef from pg_indexes where tablename = 'outbox' and indexname = 'outbox_undispatched_idx'
      `;

      expect(rows.map((row) => row.indexdef)).toEqual([
        expect.stringContaining("WHERE (dispatched_at IS NULL)"),
      ]);
    } finally {
      await sql.end();
    }
  });
});
