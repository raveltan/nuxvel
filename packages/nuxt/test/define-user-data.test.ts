import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { describe, it } from "vitest";
import { belongsTo } from "@nuxvel/nuxt/database";
import { expect } from "@nuxvel/nuxt/testing";
import { defineUserData } from "../src/runtime/server/privacy/define-user-data";

const userTable = pgTable("user", { id: text("id").primaryKey() });

describe("defineUserData without a column", () => {
  it("uses the one column that references the user table", () => {
    const postTable = pgTable("post", { id: serial("id").primaryKey(), authorId: belongsTo(userTable) });

    expect(defineUserData(postTable).column).toBe(postTable.authorId);
  });

  it.for([
    { count: 0, table: pgTable("tag", { id: serial("id").primaryKey() }) },
    {
      count: 2,
      table: pgTable("review", { id: serial("id").primaryKey(), authorId: belongsTo(userTable), reviewerId: belongsTo(userTable) }),
    },
  ])("throws for a table with $count user columns, asking for the column", ({ count, table }) => {
    expect(() => defineUserData(table)).toThrow(
      `has ${count} columns that reference the user table, so name the owner column: defineUserData(table, table.<column>)`,
    );
  });
});
