import { getTableName, type $Type, type NotNull } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import {
  integer,
  text,
  uuid,
  type AnyPgColumn,
  type PgIntegerBuilderInitial,
  type PgTable,
  type PgTextBuilderInitial,
  type PgUUIDBuilderInitial,
  type UpdateDeleteAction,
} from "drizzle-orm/pg-core";

/** A table that {@link belongsTo} can point at: one with an `id` column. */
export type ParentTable = PgTable & { id: AnyPgColumn };

type IdBuilder<Id extends AnyPgColumn> = Id["_"]["columnType"] extends "PgUUID"
  ? PgUUIDBuilderInitial<"">
  : Id["_"]["dataType"] extends "number"
    ? PgIntegerBuilderInitial<"">
    : PgTextBuilderInitial<"", [string, ...string[]]>;

/** The column builder {@link belongsTo} returns: the type of `Id`, and `NOT NULL` unless `Nullable`. */
export type BelongsToBuilder<Id extends AnyPgColumn, Nullable extends boolean> = Nullable extends true
  ? $Type<IdBuilder<Id>, Id["_"]["data"]>
  : NotNull<$Type<IdBuilder<Id>, Id["_"]["data"]>>;

const idBuilders: Record<string, (name: string) => ReturnType<typeof text | typeof uuid | typeof integer>> = {
  PgText: (name) => text(name),
  PgUUID: (name) => uuid(name),
  PgInteger: (name) => integer(name),
  PgSerial: (name) => integer(name),
};

/**
 * A foreign key column that points at the `id` of `table`: the column
 * builder of the same type as that `id` (`text`, `uuid`, or `integer` for
 * a `serial`), with `.references(() => table.id, { onDelete })`.
 *
 * Schema files import it from `@nuxvel/nuxt/database`. The column is
 * named after its key in snake_case (`authorId` is `author_id`). It
 * creates no index: keep the `index(...)` line in the table callback.
 * `belongsTo()` reads `table.id` when the schema loads, so a table that
 * points at itself, or at a table its file cannot import first, keeps the
 * hand-written `.references()`. A factory from `defineFactory` creates
 * the parent row when a test gives none, and `defineUserData(table)`
 * finds its owner column through `belongsTo(userTable)`.
 *
 * @param options.column The SQL name of the column. The default is the key in snake_case.
 * @param options.onDelete What a delete of the parent row does. The default is `"cascade"`.
 * @param options.nullable `true` makes the column nullable. The default is `NOT NULL`.
 *
 * @example
 * ```ts
 * import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
 *
 * export const postTable = pgTable("post", {
 *   id: serial("id").primaryKey(),
 *   authorId: belongsTo(userTable),
 *   editorId: belongsTo(userTable, { nullable: true, onDelete: "set null" }),
 *   ...timestamps(),
 * }, (table) => [index("post_author_id_idx").on(table.authorId), index("post_editor_id_idx").on(table.editorId)]);
 * ```
 */
export function belongsTo<Parent extends ParentTable, Nullable extends boolean = false>(
  table: Parent,
  options: { column?: string; onDelete?: UpdateDeleteAction; nullable?: Nullable } = {},
): BelongsToBuilder<Parent["id"], Nullable> {
  const build = idBuilders[table.id.columnType];

  if (!build) {
    throw new Error(
      `belongsTo(): ${getTableName(table)}.id is a ${table.id.getSQLType()} column; write the column with .references() by hand`,
    );
  }

  const column = build(options.column ?? "").references(() => table.id, { onDelete: options.onDelete ?? "cascade" });

  if (!options.nullable) column.notNull();
  if (options.column === undefined) {
    // drizzle names an unnamed column after its key through the internal setName(), so wrap it to snake_case the key
    const setName: unknown = Reflect.get(column, "setName");

    if (typeof setName !== "function") {
      throw new Error("belongsTo(): drizzle-orm has no setName() on a column builder; check that the installed drizzle-orm is a version nuxvel supports");
    }

    Object.assign(column, {
      setName: (key: string) => {
        const name = toSnakeCase(key);

        setName.call(column, name);

        if (Reflect.get(Reflect.get(column, "config"), "name") !== name) {
          throw new Error(`belongsTo(): drizzle-orm did not name the column "${key}" as "${name}"; check that the installed drizzle-orm is a version nuxvel supports`);
        }
      },
    });
  }

  // the builder is picked from the id's column type at runtime, which the generic return type mirrors
  return column as unknown as BelongsToBuilder<Parent["id"], Nullable>;
}
