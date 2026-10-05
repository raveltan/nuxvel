import { expect } from "@nuxvel/nuxt/testing";
import { eq } from "drizzle-orm";
import { describe, it } from "vitest";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { useTestDatabase } from "./helpers/database";

describe("timestamps()", () => {
  const db = useTestDatabase();

  it("sets createdAt and updatedAt on insert, and only updatedAt changes on update", async () => {
    const past = new Date("2020-01-01T00:00:00Z");
    const [inserted] = await db.insert(healthChecksTable).values({}).returning();

    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);

    await db.update(healthChecksTable).set({ createdAt: past, updatedAt: past }).where(eq(healthChecksTable.id, inserted?.id ?? -1));
    const [updated] = await db.update(healthChecksTable).set({ name: "renamed" }).where(eq(healthChecksTable.id, inserted?.id ?? -1)).returning();

    expect(updated?.createdAt).toEqual(past);
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(past.getTime());
  });
});
