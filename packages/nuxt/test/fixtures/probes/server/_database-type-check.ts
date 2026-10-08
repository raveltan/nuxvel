import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "~~/server/database/schema/auth.schema";
import { mailSuppressionsTable } from "~~/server/database/schema/mail-suppressions.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { tagsTable } from "~~/server/database/schema/tags.schema";
import { findOrFail, forceDelete, insertOne, loader, notTrashed, onlyTrashed, paginate, restore, softDelete, transaction, updateOne, useDb } from "@nuxvel/nuxt/server/database";
import { useNuxvelConfig } from "@nuxvel/nuxt/server/observability";
import { paginated } from "@nuxvel/nuxt/shared/pagination";
import type { Paginated } from "@nuxvel/nuxt/shared/pagination";

type IsAny<T> = 0 extends 1 & T ? true : false;

const db = useDb();

export const dbIsTyped: IsAny<typeof db> extends true ? never : true = true;

export async function selectedRowsAreTyped() {
  const rows = await useDb().select().from(postsTable);
  const row = rows[0];
  const rowIsTyped: IsAny<typeof row> extends true ? never : true = true;
  const title: string | undefined = row?.title;

  return { rowIsTyped, title };
}

export async function transactionTxIsTyped() {
  return transaction(async (tx) => {
    const txIsTyped: IsAny<typeof tx> extends true ? never : true = true;

    return txIsTyped;
  });
}

export async function findsByTheTablesIdType() {
  const byText = await findOrFail(userTable, "user-id");
  const email: string = byText.email;
  const byNumber = await findOrFail(postsTable, 1);
  const title: string = byNumber.title;

  // @ts-expect-error user.id is text, so findOrFail(user, …) takes a string
  await findOrFail(userTable, 1);

  // @ts-expect-error posts.id is serial, so findOrFail(posts, …) takes a number
  await findOrFail(postsTable, "1");

  return { email, title };
}

export async function softDeleteHelpersNeedSoftDeletes() {
  const trashed = await softDelete(postsTable, eq(postsTable.id, 1));
  const row = trashed[0];
  const rowIsTyped: IsAny<typeof row> extends true ? never : true = true;
  const deletedAt: Date | null | undefined = row?.deletedAt;
  const found = await findOrFail(postsTable, 1, { trashed: "only" });

  // @ts-expect-error tags has no softDeletes() column
  notTrashed(tagsTable);

  // @ts-expect-error tags has no softDeletes() column
  onlyTrashed(tagsTable);

  // @ts-expect-error tags has no softDeletes() column
  await softDelete(tagsTable, eq(tagsTable.id, 1));

  // @ts-expect-error tags has no softDeletes() column
  await restore(tagsTable, eq(tagsTable.id, 1));

  // @ts-expect-error tags has no softDeletes() column
  await forceDelete(tagsTable, eq(tagsTable.id, 1));

  // @ts-expect-error trashed applies only to a table with softDeletes()
  await findOrFail(tagsTable, 1, { trashed: "include" });

  // @ts-expect-error trashed is "exclude", "include" or "only"
  await findOrFail(postsTable, 1, { trashed: "with" });

  // @ts-expect-error softDelete needs a where condition
  await softDelete(postsTable);

  return { rowIsTyped, deletedAt, found };
}

const config = useNuxvelConfig();

export const configIsTyped: IsAny<typeof config> extends true ? never : true = true;
export const mailFrom: string | undefined = config.mail?.from;

export async function suppressionReasonIsTyped() {
  const [row] = await useDb().select().from(mailSuppressionsTable);
  const reason: "bounce" | "complaint" | undefined = row?.reason;

  // @ts-expect-error mail_suppressions.reason only holds a MailSuppressionReason
  await useDb().insert(mailSuppressionsTable).values({ address: "a@example.com", reason: "spam" });

  return reason;
}

export async function loadsByTheTablesIdType() {
  const author = await loader(userTable).load("user-id");
  const name: string | undefined = author?.name;

  // @ts-expect-error user.id is text, so loader(user).load() takes a string
  await loader(userTable).load(1);

  return name;
}

export async function paginatedSchemaMatchesPaginate() {
  const rowSchema = z.object({ id: z.number(), title: z.string() });
  type Page = z.infer<ReturnType<typeof paginated<typeof rowSchema>>>;
  type Expected = Paginated<z.infer<typeof rowSchema>>;
  const matches: IsAny<Page> extends true
    ? never
    : [Page, Expected] extends [Expected, Page]
      ? true
      : never = true;
  const page: Page = await paginate(useDb().select({ id: postsTable.id, title: postsTable.title }).from(postsTable).$dynamic());

  return { matches, page };
}

export async function writeOneIsTyped() {
  const inserted = await insertOne(postsTable, { title: "Typed", body: "", authorId: "author" });
  const updated = await updateOne(postsTable, inserted.id, { title: "Retyped" });
  const insertedIsTyped: IsAny<typeof inserted> extends true ? never : typeof inserted extends typeof postsTable.$inferSelect ? true : never = true;
  const updatedIsTyped: IsAny<typeof updated> extends true ? never : typeof updated extends typeof postsTable.$inferSelect ? true : never = true;

  // @ts-expect-error posts have no name column
  await updateOne(postsTable, inserted.id, { name: "Untyped" });

  // @ts-expect-error a post needs a title
  await insertOne(postsTable, { body: "", authorId: "author" });

  // @ts-expect-error a posts id is a number
  await updateOne(postsTable, "1", { title: "Retyped" });

  return { insertedIsTyped, updatedIsTyped };
}

export async function softDeletesByIdAreTyped() {
  const trashed = await softDelete(postsTable, 1);
  const trashedIsOneRow: IsAny<typeof trashed> extends true ? never : typeof trashed extends typeof postsTable.$inferSelect ? true : never = true;
  const many = await restore(postsTable, eq(postsTable.id, 1));
  const manyIsRows: typeof many extends (typeof postsTable.$inferSelect)[] ? true : never = true;

  // @ts-expect-error a posts id is a number
  await forceDelete(postsTable, "1");

  return { trashedIsOneRow, manyIsRows };
}
