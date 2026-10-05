import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

/** Where one user's personal data lives: the rows of `table` whose `column` holds their id. */
export interface UserData<Table extends PgTable = PgTable> {
  table: Table;
  column: AnyPgColumn;
  personal: AnyPgColumn[];
}

/** Whether `value` is a declaration from {@link defineUserData}. */
export function isUserData(value: unknown): value is UserData {
  return typeof value === "object" && value !== null && "table" in value && "column" in value && "personal" in value;
}

/** The columns of `Table` that hold a string, and so can hold a user's id. */
export type UserIdColumn<Table extends PgTable> = {
  [Key in keyof Table["_"]["columns"]]: Table["_"]["columns"][Key]["_"]["data"] extends string
    ? Table["_"]["columns"][Key]
    : never;
}[keyof Table["_"]["columns"]];

/**
 * Declares that the rows of `table` whose `column` equals a user's id are
 * that user's personal data.
 *
 * `defineUserData` is auto-imported. One declaration per file, under
 * `server/privacy/`, as a named export whose name ends with `UserData`
 * (a default export also works); the file is discovered, so nothing
 * registers it.
 * `column` must be a string column of `table` itself. Several declarations
 * on one table are merged: a row matching any of their columns belongs to
 * the user. {@link exportUserData} collects every declared table's rows and
 * {@link eraseUserData} deletes them.
 *
 * @param options.personal Columns of `table` whose values the audit log
 * never holds: {@link audit} records that such a column changed, as
 * `{ changed: true }`, but not its old or new value.
 *
 * @example
 * ```ts
 * // server/privacy/posts.user-data.ts
 * export const postsUserData = defineUserData(postsTable, postsTable.authorId);
 *
 * // server/privacy/users.user-data.ts
 * export const usersUserData = defineUserData(userTable, userTable.id, { personal: [userTable.name, userTable.email] });
 * ```
 */
export function defineUserData<Table extends PgTable>(
  table: Table,
  column: UserIdColumn<Table>,
  options: { personal?: Table["_"]["columns"][keyof Table["_"]["columns"]][] } = {},
): UserData<Table> {
  return { table, column, personal: options.personal ?? [] };
}
