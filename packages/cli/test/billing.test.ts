import { describe, expect, it } from "vitest";
import { scratchDatabase } from "./helpers/database.ts";
import { migrate } from "@nuxvel/test-helpers/cli";
import { scratchSql } from "@nuxvel/test-helpers/sql";
import { runCliWithEnv, stripAnsi, tableRows } from "./helpers/run.ts";
import { sharedPlayground } from "./helpers/scratch.ts";

describe("nuxvel billing commands", () => {
  const playground = sharedPlayground("billing");

  it("billing:status lists the stored events that are not processed, and billing:replay processes one again", async () => {
    const databaseUrl = await scratchDatabase("billing-status");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl, NUXT_AUTH_SECRET: "billing-test-secret-billing-test-secret" };

    await migrate(playground, env);

    const sql = scratchSql(databaseUrl);

    await sql`
      insert into billing_events (id, type, object_id, livemode, stripe_created_at, received_at, processed_at, attempts, last_error)
      values
        ('evt_done', 'customer.subscription.updated', 'sub_1', false, now(), '2026-10-01T10:00:00Z', now(), 1, null),
        ('evt_failed', 'customer.created', 'cus_1', false, now(), '2026-10-01T11:00:00Z', null, 3, 'No such customer')
    `;

    const status = await runCliWithEnv(playground, env, "billing:status");

    expect(status.exitCode, status.stderr).toBe(1);
    expect(stripAnsi(status.stderr)).toContain("2 Stripe events stored, 1 not processed");
    expect(tableRows(status.stdout)).toEqual({
      header: ["EVENT", "TYPE", "RECEIVED", "ATTEMPTS", "LAST ERROR"],
      rows: [["evt_failed", "customer.created", "2026-10-01T11:00:00.000Z", "3", "No such customer"]],
    });

    const replay = await runCliWithEnv(playground, env, "billing:replay", "evt_failed");

    expect(replay.exitCode, replay.stderr).toBe(0);
    expect(stripAnsi(replay.stderr)).toContain("✔ processed customer.created evt_failed again");

    const json = await runCliWithEnv(playground, env, "billing:status", "--json");

    expect(json.exitCode, json.stderr).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({ total: 2, pending: [] });

    const missing = await runCliWithEnv(playground, env, "billing:replay", "evt_missing");

    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain('no Stripe event "evt_missing" is stored');
  }, 180000);
});
