import { createHmac, randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { actingAs, expect, expectRow, freezeTime, guest, travelBy, travelTo } from "@nuxvel/nuxt/testing";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { auditLogTable } from "../../../playground/server/database/schema/audit-log.schema";
import { userTable } from "../../../playground/server/database/schema/auth.schema";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const PREVIOUS_SECRET = "clock-previous-webhook-secret";
const DAY_MS = 24 * 60 * 60 * 1000;

function deliverSignedWithPreviousSecret() {
  const body = JSON.stringify({ id: randomUUID(), type: "probe.pinged" });

  return guest().fetch("/api/webhooks/_probe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-probe-signature": createHmac("sha256", PREVIOUS_SECRET).update(body).digest("hex"),
    },
    body,
  });
}

describe("the test clock", async () => {
  await setupPlayground({
    env: {
      NUXT_PROBE_WEBHOOK_SECRET: "clock-current-webhook-secret",
      NUXT_PROBE_WEBHOOK_SECRET_PREVIOUS: PREVIOUS_SECRET,
      NUXT_PROBE_WEBHOOK_SECRET_PREVIOUS_EXPIRES_AT: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    },
  });

  it("freezeTime() shows in the timestamps of a row the server writes", async () => {
    const frozenAt = new Date("2030-01-01T00:00:00Z");
    const { trpc } = actingAs(await userFactory());

    expect(await freezeTime(frozenAt)).toEqual(frozenAt);
    const created = await trpc.health.create({});

    await expectRow(healthChecksTable, { id: created.id, createdAt: frozenAt, updatedAt: frozenAt });
  });

  it("a factory row gets the moved time after travelBy()", async () => {
    const movedTo = await travelBy({ days: 31 });

    const row = await healthCheckFactory();

    expect(Math.abs(row.createdAt.getTime() - movedTo.getTime())).toBeLessThan(1000);
  });

  it("a factory row and an app row get the same createdAt after freezeTime()", async () => {
    const frozenAt = await freezeTime();
    const row = await healthCheckFactory();
    const created = await actingAs(await userFactory()).trpc.health.create({});

    expect(row.createdAt).toEqual(frozenAt);
    await expectRow(healthChecksTable, { id: created.id, createdAt: frozenAt });
  });

  it("a factory row of a starter table gets the frozen time in its default timestamp columns", async () => {
    const frozenAt = await freezeTime();
    const auditFactory = defineFactory(auditLogTable, {
      actorType: "system",
      actorId: "clock-test",
      action: "clock.test",
      targetType: "clock",
      targetId: "1",
      hash: "clock-test-hash",
    });

    const user = await userFactory();
    const entry = await auditFactory();

    await expectRow(userTable, { id: user.id, createdAt: frozenAt, updatedAt: frozenAt });
    expect(entry.occurredAt).toEqual(frozenAt);
  });

  it("the next test sees the real time", async () => {
    const row = await healthCheckFactory();

    expect(Math.abs(row.createdAt.getTime() - Date.now())).toBeLessThan(5000);
  });

  it("a rotated secret's grace period ends only after travelBy({ days: 31 })", async () => {
    expect((await deliverSignedWithPreviousSecret()).status).toBe(200);

    await travelBy({ days: 29 });
    expect((await deliverSignedWithPreviousSecret()).status).toBe(200);

    await travelBy({ days: 2 });
    expect((await deliverSignedWithPreviousSecret()).status).toBe(401);
  });

  it("puts the real time back after each test, and travelTo() keeps the clock ticking", async () => {
    expect((await deliverSignedWithPreviousSecret()).status).toBe(200);

    const start = new Date("2031-06-01T00:00:00Z");
    const movedTo = await travelTo(start);

    expect(movedTo.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(movedTo.getTime()).toBeLessThan(start.getTime() + 60_000);
  });
});
