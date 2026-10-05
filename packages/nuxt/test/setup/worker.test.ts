import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import postgres from "postgres";
import { workerDatabaseName } from "./worker";

describe("per-worker database clone", () => {
  it("connects to its own cloned database", async () => {
    const sql = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1 });
    const [{ current_database }] = await sql`select current_database()`;
    expect(current_database).toBe(workerDatabaseName());
    await sql.end();
  });
});
