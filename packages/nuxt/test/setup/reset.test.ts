import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it } from "vitest";
import postgres from "postgres";
import { resetTouchedTables } from "./tracking";
import { workerDatabaseUrl } from "./worker";

describe("touched-table reset", () => {
  const sql = postgres(workerDatabaseUrl(), { max: 1, onnotice: () => {} });

  afterAll(() => sql.end());

  it("tracks a table touched by a write and truncates it on reset", async () => {
    await sql`create table if not exists _reset_probe (id int)`;
    await sql`insert into _reset_probe (id) values (1)`;

    expect(await sql`select table_name from _nuxvel_touched_tables`).toEqual([
      { table_name: "public._reset_probe" },
    ]);

    await resetTouchedTables(sql);

    expect(await sql`select * from _reset_probe`).toHaveLength(0);
    expect(await sql`select * from _nuxvel_touched_tables`).toHaveLength(0);
  });
});
