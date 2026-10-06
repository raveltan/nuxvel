import { AsyncLocalStorage } from "node:async_hooks";
import { getTableColumns, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import type { SoftDeletableTable } from "../../runtime/server/database/soft-deletes";
import { factoryDatabase } from "./factory-database";
import { factoryDefault } from "./factory-defaults";

type Recycled = ReadonlyMap<PgTable, unknown>;

const recycledRows = new AsyncLocalStorage<Recycled>();

type FactoryValue<Value, Row> = Value | ((row: Row) => Value | Promise<Value>);

/**
 * What {@link defineFactory} and {@link Factory.state} take: a value, or
 * a function evaluated per row, for any column of `Table`. A function
 * that declares a parameter gets the row being built, after every other
 * column is set. A column derived later in the definition is not set yet.
 */
export type FactoryDefinition<Table extends PgTable> = {
  [Key in keyof InferInsertModel<Table>]?: FactoryValue<InferInsertModel<Table>[Key], InferInsertModel<Table>>;
};

/**
 * A parent row by its relation name: the name of an `...Id` column
 * without `Id`. `{ author: user }` sets `authorId` to `user.id`.
 */
export type FactoryRelations<Table extends PgTable> = {
  [Key in keyof InferInsertModel<Table> as Key extends `${infer Relation}Id` ? Relation : never]?: {
    id: NonNullable<InferInsertModel<Table>[Key]>;
  };
};

/**
 * What a call of a {@link Factory} takes: any column of `Table`, and a
 * parent row by its relation name ({@link FactoryRelations}).
 */
export type FactoryOverrides<Table extends PgTable> = Partial<InferInsertModel<Table>> & FactoryRelations<Table>;

type ChildFactory<Table extends PgTable> = (
  parent: InferSelectModel<Table>,
) => () => Promise<unknown>;

type AfterCreate<Table extends PgTable> = (row: InferSelectModel<Table>) => unknown;

/**
 * A callable factory from {@link defineFactory}. Call it to insert a row
 * and get it back as the table's select type; chain `.state()`, `.for()`
 * or `.has()` to derive a variant first.
 */
export interface Factory<Table extends PgTable> {
  (overrides?: FactoryOverrides<Table>): Promise<InferSelectModel<Table>>;
  /**
   * A factory with `overrides` merged over this one's definition; a
   * per-call override still wins.
   */
  state(overrides: FactoryDefinition<Table>): Factory<Table>;
  /**
   * A factory whose `column` is set to `row.id` — the row it belongs to.
   * `row.id` must fit the column.
   *
   * @example
   * ```ts
   * const post = await postFactory.for("authorId", author)();
   * ```
   */
  for<Column extends keyof Table["$inferInsert"]>(
    column: Column,
    row: { id: NonNullable<Table["$inferInsert"][Column]> },
  ): Factory<Table>;
  /**
   * A factory that, after inserting each row, inserts `count` more from
   * the factory `child` builds for it.
   *
   * @example
   * ```ts
   * const author = await userFactory.has(3, (user) => postFactory.for("authorId", user))();
   * ```
   */
  has(count: number, child: ChildFactory<Table>): Factory<Table>;
  /**
   * A factory whose rows are soft-deleted: `deletedAt` is the time of
   * the insert. Only on a table with `softDeletes()`.
   *
   * @example
   * ```ts
   * const trashed = await postFactory.trashed()();
   * ```
   */
  trashed: Table extends SoftDeletableTable ? () => Factory<Table> : never;
  /**
   * Inserts `count` rows in one `INSERT ... RETURNING` and returns them.
   * Each row still gets its own definition values, `.afterCreate()`
   * hooks and `.has()` children.
   *
   * @example
   * ```ts
   * const posts = await postFactory.for("authorId", author).count(10)();
   * ```
   */
  count(count: number): (overrides?: FactoryOverrides<Table>) => Promise<InferSelectModel<Table>[]>;
  /**
   * Builds the insert object of a row without inserting it. A function
   * in the definition still runs, and a missing parent row is still
   * created: pass that column in `overrides` to skip it.
   *
   * @example
   * ```ts
   * const values = await postFactory.make({ authorId: author.id });
   * ```
   */
  make(overrides?: FactoryOverrides<Table>): Promise<InferInsertModel<Table>>;
  /**
   * A factory that runs `fn` once for each row it inserts, after the
   * insert. Hooks and `.has()` children run in the order they are
   * added.
   *
   * @example
   * ```ts
   * const tagged = postFactory.afterCreate((post) => tagFactory({ postId: post.id }));
   * ```
   */
  afterCreate(fn: AfterCreate<Table>): Factory<Table>;
  /**
   * A factory whose nested factories for `table` return `row` instead of inserting a new row.
   * It applies to each factory that a definition function, a `.has()` child or an `.afterCreate()` hook calls while this factory inserts.
   * Only a nested call with no overrides reuses the row. `.count()` on the nested factory still inserts.
   *
   * @example
   * ```ts
   * const author = await userFactory();
   * const post = await postFactory.recycle(userTable, author)();
   * ```
   */
  recycle<Other extends PgTable>(table: Other, row: InferSelectModel<Other>): Factory<Table>;
}

function insertRows(table: PgTable, values: Record<string, unknown>[]) {
  return factoryDatabase().insert(table).values(values).returning();
}

const registered = new Map<PgTable, () => Promise<Record<string, unknown>>>();

function columnsByRelation(columns: Record<string, PgColumn>, overrides: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(overrides).map(([key, value]) =>
      !(key in columns) && `${key}Id` in columns && typeof value === "object" && value !== null && "id" in value
        ? [`${key}Id`, value.id]
        : [key, value],
    ),
  );
}

function parentOf(table: PgTable, column: PgColumn) {
  for (const foreignKey of getTableConfig(table).foreignKeys) {
    const { columns, foreignTable, foreignColumns } = foreignKey.reference();
    const key = Object.entries(getTableColumns(foreignTable)).find(([, candidate]) => candidate === foreignColumns[0])?.[0];

    if (columns.length === 1 && columns[0] === column && foreignTable !== table && key) return { table: foreignTable, key };
  }

  return undefined;
}

async function missingValue(table: PgTable, column: PgColumn) {
  const parent = parentOf(table, column);

  if (!parent) return factoryDefault(column).value();

  const create = registered.get(parent.table) ?? createFactory(parent.table, {}, []);

  return (await create())[parent.key];
}

async function buildRow(
  table: PgTable,
  definition: Record<string, unknown>,
  relationOverrides: Record<string, unknown>,
) {
  const columns = getTableColumns(table);
  const overrides = columnsByRelation(columns, relationOverrides);
  const row: Record<string, unknown> = {};
  const derived: Array<() => Promise<void>> = [];

  for (const [key, column] of Object.entries(columns)) {
    if (key in overrides) {
      row[key] = overrides[key];
    } else if (!(key in definition) && column.notNull && !column.hasDefault) {
      row[key] = await missingValue(table, column);
    }
  }

  for (const [key, value] of Object.entries(definition)) {
    if (!(key in columns) || key in overrides) continue;

    if (typeof value !== "function") row[key] = value;
    else if (value.length > 0) derived.push(async () => void (row[key] = await value(row)));
    else row[key] = await value();
  }

  for (const derive of derived) await derive();

  return row;
}

function createFactory<Table extends PgTable>(
  table: Table,
  definition: FactoryDefinition<Table>,
  after: Array<AfterCreate<Table>>,
  recycled: Recycled = new Map(),
): Factory<Table> {
  function inScope<Result>(fn: () => Promise<Result>) {
    if (recycled.size === 0) return fn();

    return recycledRows.run(new Map([...(recycledRows.getStore() ?? []), ...recycled]), fn);
  }

  const make = (overrides: FactoryOverrides<Table> = {}) =>
    inScope(
      // columns are walked by name, so the row is only known to fit the table at runtime
      async () => (await buildRow(table, definition, overrides)) as InferInsertModel<Table>,
    );

  const insertMany = (count: number, overrides: FactoryOverrides<Table> = {}) =>
    inScope(() => insertManyRows(count, overrides));

  async function insertManyRows(count: number, overrides: FactoryOverrides<Table>) {
    if (count < 1) return [];

    const values: Record<string, unknown>[] = [];

    for (let index = 0; index < count; index++) values.push(await buildRow(table, definition, overrides));

    // columns are walked by name, so the rows are only known to fit the table at runtime
    const rows = (await insertRows(table, values)) as InferSelectModel<Table>[];

    for (const row of rows) {
      for (const hook of after) await hook(row);
    }

    return rows;
  }

  async function insert(overrides: FactoryOverrides<Table> = {}) {
    const reused = recycledRows.getStore()?.get(table);

    // the map is keyed by table, so the row stored under this table is its select type
    if (reused && Object.keys(overrides).length === 0) return reused as InferSelectModel<Table>;

    const [row] = await insertMany(1, overrides);

    if (!row) throw new Error("defineFactory: the insert returned no row");

    return row;
  }

  const withHook = (hook: AfterCreate<Table>) => createFactory(table, definition, [...after, hook], recycled);

  // a conditional member of Factory cannot resolve for a generic table
  return Object.assign(insert, {
    state: (overrides: FactoryDefinition<Table>) => createFactory(table, { ...definition, ...overrides }, after, recycled),
    for: <Column extends keyof Table["$inferInsert"]>(
      column: Column,
      row: { id: NonNullable<Table["$inferInsert"][Column]> },
    ) => createFactory(table, { ...definition, [column]: row.id }, after, recycled),
    has: (count: number, child: ChildFactory<Table>) =>
      withHook(async (row) => {
        const childFactory = child(row);
        for (let index = 0; index < count; index++) await childFactory();
      }),
    trashed: () => createFactory(table, { ...definition, deletedAt: () => new Date() }, after, recycled),
    count: (count: number) => (overrides?: FactoryOverrides<Table>) => insertMany(count, overrides),
    make,
    afterCreate: withHook,
    recycle: (other: PgTable, row: unknown) => createFactory(table, definition, after, new Map([...recycled, [other, row]])),
  }) as Factory<Table>;
}

/**
 * Defines a factory that inserts rows into `table` for tests and
 * seeders, returning each as the table's select type.
 *
 * Import it from `@nuxvel/nuxt/factories`. In a test it runs in the test
 * process on its own connection to the test database, so it needs no
 * server. In a {@link defineSeeder} seeder it inserts through `useDb()`,
 * so its rows join the seeder's transaction. Any `NOT NULL` column left out of `definition`
 * — and without a database default — gets a `@faker-js/faker` value
 * picked from its type and name (an `email` column gets an email, a
 * unique text column a UUID), so a factory keeps inserting as the
 * table grows. Values may be literals or (async) functions, evaluated
 * per row. A function that takes a parameter derives its column from
 * the row: it runs after every other column is set, in definition order.
 * A `NOT NULL` foreign key column, such as a `belongsTo()` column,
 * with no value gets a new parent row from the first factory defined for
 * the parent table, or from a bare factory of it when no factory file of
 * that table is loaded. Give a parent by its relation name, the column
 * name without `Id`: `postFactory({ author })` sets `authorId`. Derive variants with `.state()`, `.for()`, `.has()`,
 * `.afterCreate()`, `.recycle()` and, on a table with `softDeletes()`, `.trashed()`.
 * Insert many rows at once with `.count(n)`, or build a row without
 * inserting it with `.make()`. Use {@link sequence} for a unique column
 * with domain meaning.
 *
 * @example
 * ```ts
 * export const postFactory = defineFactory(postsTable, {
 *   title: sequence((n) => `Post ${n}`),
 *   body: (post) => `About ${post.title}`,
 * });
 *
 * const draft = await postFactory.state({ publishedAt: null })();
 * const mine = await postFactory({ author: user });
 * ```
 */
export function defineFactory<Table extends PgTable>(
  table: Table,
  definition: FactoryDefinition<Table> = {},
): Factory<Table> {
  const factory = createFactory(table, definition, []);

  if (!registered.has(table)) registered.set(table, factory);

  return factory;
}
