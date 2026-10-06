import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgColumn, type AnyPgColumn, type PgTable } from "drizzle-orm/pg-core";

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

type UserDataOptions<Table extends PgTable> = { personal?: Table["_"]["columns"][keyof Table["_"]["columns"]][] };

function isColumn(value: unknown): value is AnyPgColumn {
  return is(value, PgColumn);
}

function ownerColumn(table: PgTable) {
  const owners = getTableConfig(table)
    .foreignKeys.map((foreignKey) => foreignKey.reference())
    .filter(({ columns, foreignTable }) => columns.length === 1 && getTableName(foreignTable) === "user");
  const owner = owners.length === 1 ? owners[0]?.columns[0] : undefined;

  if (!owner) {
    throw new Error(
      `defineUserData(): ${getTableName(table)} has ${owners.length} columns that reference the user table, so name the owner column: defineUserData(table, table.<column>)`,
    );
  }

  return owner;
}

/**
 * Declares that the rows of `table` whose `column` equals a user's id are
 * that user's personal data.
 *
 * `defineUserData` is auto-imported. One declaration per file, under
 * `server/privacy/`, as a named export whose name ends with `UserData`
 * (a default export also works); the file is discovered, so nothing
 * registers it.
 * `column` must be a string column of `table` itself. Without it, the
 * column is the one that references the user table, such as
 * `belongsTo(userTable)`, and a table with no such column or with more
 * than one throws when the file loads. Several declarations
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
 * export const postsUserData = defineUserData(postsTable);
 *
 * // server/privacy/reviews.user-data.ts
 * export const reviewsUserData = defineUserData(reviewsTable, reviewsTable.reviewerId);
 *
 * // server/privacy/users.user-data.ts
 * export const usersUserData = defineUserData(userTable, userTable.id, { personal: [userTable.name, userTable.email] });
 * ```
 */
export function defineUserData<Table extends PgTable>(table: Table, options?: UserDataOptions<Table>): UserData<Table>;
export function defineUserData<Table extends PgTable>(
  table: Table,
  column: UserIdColumn<Table>,
  options?: UserDataOptions<Table>,
): UserData<Table>;
export function defineUserData<Table extends PgTable>(
  table: Table,
  columnOrOptions?: AnyPgColumn | UserDataOptions<Table>,
  options: UserDataOptions<Table> = {},
): UserData<Table> {
  if (isColumn(columnOrOptions)) return { table, column: columnOrOptions, personal: options.personal ?? [] };

  return { table, column: ownerColumn(table), personal: columnOrOptions?.personal ?? [] };
}
