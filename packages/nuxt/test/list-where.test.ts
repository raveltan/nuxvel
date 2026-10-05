import { expect } from "@nuxvel/nuxt/testing";
import { and, asc, eq, sql } from "drizzle-orm";
import { boolean, date, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { listOrderBy, listWhere } from "../src/runtime/server/database/list-query";
import { listQuery } from "../src/runtime/shared/pagination/list-query";
import { useTestDatabase } from "./helpers/database";

const taskTable = pgSchema("list_query_test").table("task", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status", { enum: ["open", "done", "archived"] }).notNull(),
  urgent: boolean("urgent").notNull(),
  dueOn: date("due_on"),
  doneAt: timestamp("done_at"),
});

const taskList = listQuery({
  sort: ["id", "title", "status", "dueOn"],
  filters: { title: "text", status: ["open", "done", "archived"], urgent: "boolean", dueOn: "dateRange", doneAt: "dateRange" },
});

describe("listWhere() and listOrderBy()", () => {
  const db = useTestDatabase();

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists list_query_test cascade`);
    await db.execute(sql`create schema list_query_test`);
    await db.execute(sql`
      create table list_query_test.task (
        id integer primary key, title text not null, status text not null,
        urgent boolean not null, due_on date, done_at timestamp
      )`);
  });

  beforeEach(async () => {
    await db.delete(taskTable);
    await db.insert(taskTable).values([
      { id: 1, title: "Quarterly report", status: "open", urgent: true, dueOn: "2026-01-10", doneAt: null },
      { id: 2, title: "Holiday plan", status: "done", urgent: false, dueOn: "2026-01-31", doneAt: new Date("2026-01-31T23:30:00Z") },
      { id: 3, title: "100% done_ish", status: "archived", urgent: false, dueOn: null, doneAt: new Date("2026-02-01T00:00:00Z") },
      { id: 4, title: "report draft", status: "open", urgent: false, dueOn: "2026-02-15", doneAt: null },
    ]);
  });

  afterAll(async () => {
    await db.execute(sql`drop schema if exists list_query_test cascade`);
  });

  async function ids(input: Record<string, unknown>) {
    const query = taskList.parse(input);
    const rows = await db
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(listWhere(taskTable, query.filters))
      .orderBy(...listOrderBy(taskTable, query.sort), asc(taskTable.id));

    return rows.map((row) => row.id);
  }

  it("returns no condition and no order terms for an empty query", async () => {
    const query = taskList.parse({});

    expect(listWhere(taskTable, query.filters)).toBeUndefined();
    expect(listOrderBy(taskTable, query.sort)).toEqual([]);
    expect(await ids({})).toEqual([1, 2, 3, 4]);
  });

  it("text: matches anywhere, case-insensitive, with % and _ taken literally", async () => {
    expect(await ids({ title: "REPORT" })).toEqual([1, 4]);
    expect(await ids({ title: "100%" })).toEqual([3]);
    expect(await ids({ title: "%" })).toEqual([3]);
    expect(await ids({ title: "e_i" })).toEqual([3]);
    expect(await ids({ title: "_" })).toEqual([3]);
  });

  it("select: matches any of the values", async () => {
    expect(await ids({ status: "open" })).toEqual([1, 4]);
    expect(await ids({ status: "done,archived" })).toEqual([2, 3]);
  });

  it("boolean: matches true and false", async () => {
    expect(await ids({ urgent: "true" })).toEqual([1]);
    expect(await ids({ urgent: "false" })).toEqual([2, 3, 4]);
  });

  it("dateRange: includes both ends on a date column, and skips nulls", async () => {
    expect(await ids({ dueOn: "2026-01-10..2026-01-31" })).toEqual([1, 2]);
    expect(await ids({ dueOn: "2026-01-31.." })).toEqual([2, 4]);
    expect(await ids({ dueOn: "..2026-01-09" })).toEqual([]);
  });

  it("dateRange: includes the whole last day on a timestamp column", async () => {
    expect(await ids({ doneAt: "..2026-01-31" })).toEqual([2]);
    expect(await ids({ doneAt: "2026-02-01..2026-02-01" })).toEqual([3]);
  });

  it("combines filters with and, and with other conditions", async () => {
    expect(await ids({ title: "report", status: "open", urgent: "false" })).toEqual([4]);

    const query = taskList.parse({ status: "open" });
    const rows = await db.select({ id: taskTable.id }).from(taskTable).where(and(listWhere(taskTable, query.filters), eq(taskTable.urgent, true)));

    expect(rows.map((row) => row.id)).toEqual([1]);
  });

  it("sorts by several columns in order, ahead of the tiebreaker", async () => {
    expect(await ids({ sort: "status:asc,title:desc" })).toEqual([3, 2, 4, 1]);
    expect(await ids({ sort: "dueOn:desc" })).toEqual([3, 4, 2, 1]);
    expect(await ids({ sort: "id:desc" })).toEqual([4, 3, 2, 1]);
  });

  it("throws on a key that is not a column of the table", () => {
    // @ts-expect-error `nope` is not a column of the table.
    expect(() => listWhere(taskTable, { nope: "x" })).toThrow('"nope" is not a column of the table task');
    // @ts-expect-error `nope` is not a column of the table.
    expect(() => listOrderBy(taskTable, [{ column: "nope", direction: "asc" }])).toThrow(/not a column/);
  });
});
