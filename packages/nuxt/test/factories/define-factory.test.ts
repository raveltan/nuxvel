import { expect } from "@nuxvel/nuxt/testing";
import { getTableColumns, sql } from "drizzle-orm";
import { cidr, date, inet, interval, jsonb, macaddr, macaddr8, numeric, pgTable, serial, text, time, uuid } from "drizzle-orm/pg-core";
import { describe, it } from "vitest";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { userTable } from "../../../../playground/server/database/schema/auth.schema";
import { postsTable } from "../../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../../playground/server/factories/users.factory";
import { useTestDatabase } from "../helpers/database";

describe("defineFactory", () => {
  const db = useTestDatabase();

  it("derives defaults for every NOT NULL column when the caller supplies zero fields", async () => {
    const post: Record<string, unknown> = await postFactory();

    for (const [key, column] of Object.entries(getTableColumns(postsTable))) {
      if (!column.notNull) continue;

      expect(post[key]).not.toBeNull();
      expect(post[key]).not.toBeUndefined();
    }
  });

  it("returns the inserted row, database defaults included", async () => {
    const post = await postFactory({ title: "Given" });

    expect(post.id).toEqual(expect.any(Number));
    expect(post.createdAt).toBeInstanceOf(Date);
    expect(post.title).toBe("Given");
  });

  it("synthesizes a different text value for each row", async () => {
    const author = await userFactory();
    const bareFactory = defineFactory(postsTable, { authorId: author.id });

    const first = await bareFactory();
    const second = await bareFactory();

    expect(first.title).not.toBe(second.title);
  });

  it("fills required columns with Faker values picked from the column name, and keeps unique columns unique", async () => {
    const bareUserFactory = defineFactory(userTable);

    const first = await bareUserFactory();
    const second = await bareUserFactory();
    const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    expect(first.id).toMatch(new RegExp(`^${uuid}$`));
    expect(first.email).toMatch(new RegExp(`^[^@\\s]+\\+${uuid}@[^@\\s]+\\.[a-z]+$`, "i"));
    expect(first.email).not.toBe(second.email);
    expect(first.name).toContain(" ");
    expect(first.name).not.toMatch(/^factory-/);
  });

  it("fills a plain uuid column and other typed string columns with values Postgres accepts, dates and json included", async () => {
    const typedTable = pgTable("typed_columns", {
      id: serial("id").primaryKey(),
      token: uuid("token").notNull(),
      address: inet("address").notNull(),
      network: cidr("network").notNull(),
      device: macaddr("device").notNull(),
      device8: macaddr8("device8").notNull(),
      price: numeric("price").notNull(),
      label: text("label").notNull(),
      openedOn: date("opened_on").notNull(),
      meta: jsonb("meta").notNull(),
    });

    const values = await defineFactory(typedTable).make();
    const [cast] = await db.execute(sql`
      select ${values.token}::uuid, ${values.address}::inet, ${values.network}::cidr,
        ${values.device}::macaddr, ${values.device8}::macaddr8, ${values.price}::numeric, ${values.openedOn}::date
    `);

    expect(values.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(cast).toBeDefined();
    expect(values.label).toEqual(expect.any(String));
    expect(values.meta).toEqual({});
  });

  it("throws and names a required column whose type has no default", async () => {
    const durationFactory = defineFactory(pgTable("durations", { span: interval("span").notNull() }));
    const clockFactory = defineFactory(pgTable("clocks", { at: time("at").notNull() }));

    await expect(durationFactory.make()).rejects.toThrow('no factory default for column "span" (type "interval")');
    await expect(clockFactory.make()).rejects.toThrow('no factory default for column "at" (type "time")');
  });
});
