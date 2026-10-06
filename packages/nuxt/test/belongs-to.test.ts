import { ColumnBuilder } from "drizzle-orm";
import { bigserial, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { describe, it } from "vitest";
import { belongsTo } from "@nuxvel/nuxt/database";
import { expect } from "@nuxvel/nuxt/testing";

const userTable = pgTable("user", { id: text("id").primaryKey() });

function withSetName<Result>(setName: unknown, run: () => Result) {
  const original: unknown = Reflect.get(ColumnBuilder.prototype, "setName");

  Reflect.set(ColumnBuilder.prototype, "setName", setName);

  try {
    return run();
  } finally {
    Reflect.set(ColumnBuilder.prototype, "setName", original);
  }
}

describe("belongsTo", () => {
  it.for([
    { key: "authorId", name: "author_id" },
    { key: "apiURL", name: "api_url" },
    { key: "userID", name: "user_id" },
  ])("names the column $key as $name", ({ key, name }) => {
    const table = pgTable("task", { [key]: belongsTo(userTable) });

    expect(Object.values(table).find((column) => column?.name === name)).toBeDefined();
  });

  it.for([
    { type: "varchar", parent: pgTable("team", { id: varchar("id", { length: 36 }).primaryKey() }) },
    { type: "bigserial", parent: pgTable("team", { id: bigserial("id", { mode: "number" }).primaryKey() }) },
  ])("refuses a $type id", ({ parent }) => {
    expect(() => belongsTo(parent)).toThrow(/belongsTo\(\): team\.id is a \S+ column; write the column with \.references\(\) by hand/);
  });

  it("throws when drizzle-orm has no setName() on a column builder", () => {
    withSetName(undefined, () => {
      expect(() => belongsTo(userTable)).toThrow("belongsTo(): drizzle-orm has no setName() on a column builder");
    });
  });

  it("throws when drizzle-orm does not give the column the snake_case name", () => {
    withSetName(() => undefined, () => {
      expect(() => pgTable("task", { authorId: belongsTo(userTable) })).toThrow(
        'belongsTo(): drizzle-orm did not name the column "authorId" as "author_id"',
      );
    });
  });
});
