import { type PgTable, getTableConfig } from "drizzle-orm/pg-core";

function columnName(column: unknown) {
  return typeof column === "object" && column !== null && "name" in column && typeof column.name === "string"
    ? column.name
    : undefined;
}

function leadingColumns(table: PgTable) {
  const config = getTableConfig(table);

  return [
    ...config.columns.filter((column) => column.primary || column.isUnique).map((column) => [column.name]),
    ...config.primaryKeys.map((key) => key.columns.map((column) => column.name)),
    ...config.uniqueConstraints.map((constraint) => constraint.columns.map((column) => column.name)),
    ...config.indexes
      .filter((index) => !index.config.where)
      .map((index) => index.config.columns.map(columnName)),
  ];
}

function covers(leading: (string | undefined)[], columns: string[]) {
  const prefix = leading.slice(0, columns.length);

  return prefix.length === columns.length && columns.every((column) => prefix.includes(column));
}

export function unindexedForeignKeys(tables: PgTable[]) {
  return tables.flatMap((table) => {
    const config = getTableConfig(table);
    const indexed = leadingColumns(table);

    return config.foreignKeys
      .map((foreignKey) => foreignKey.reference().columns.map((column) => column.name))
      .filter((columns) => !indexed.some((leading) => covers(leading, columns)))
      .map((columns) => `${config.name}.${columns.join(",")}`);
  });
}
