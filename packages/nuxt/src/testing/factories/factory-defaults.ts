import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker/locale/en";
import type { PgColumn } from "drizzle-orm/pg-core";

interface FactoryDefault {
  value(): unknown;
  source: string;
}

const fake = (value: () => unknown, call: string): FactoryDefault => ({ value, source: `() => ${call}` });

const email = fake(() => faker.internet.email(), "faker.internet.email()");
const uniqueEmail = fake(
  () => faker.internet.email().replace("@", `+${randomUUID()}@`),
  'faker.internet.email().replace("@", `+${crypto.randomUUID()}@`)',
);
const uuid = fake(() => randomUUID(), "crypto.randomUUID()");
const words = fake(() => faker.lorem.words(), "faker.lorem.words()");

const namedTexts: Array<[RegExp, FactoryDefault]> = [
  [/url|image|avatar/i, fake(() => faker.internet.url(), "faker.internet.url()")],
  [/slug/i, fake(() => faker.lorem.slug(), "faker.lorem.slug()")],
  [/title/i, fake(() => faker.lorem.sentence(), "faker.lorem.sentence()")],
  [/name/i, fake(() => faker.person.fullName(), "faker.person.fullName()")],
];

const byType: Record<string, FactoryDefault> = {
  number: fake(() => faker.number.int({ min: 1, max: 1000 }), "faker.number.int({ min: 1, max: 1000 })"),
  boolean: fake(() => faker.datatype.boolean(), "faker.datatype.boolean()"),
  date: fake(() => faker.date.recent(), "faker.date.recent()"),
  json: fake(() => ({}), "({})"),
};

const byColumnType: Record<string, FactoryDefault> = {
  PgUUID: uuid,
  PgDateString: fake(() => faker.date.recent().toISOString().slice(0, 10), "faker.date.recent().toISOString().slice(0, 10)"),
  PgInet: fake(() => faker.internet.ipv4(), "faker.internet.ipv4()"),
  PgCidr: fake(() => `${faker.internet.ipv4()}/32`, "`${faker.internet.ipv4()}/32`"),
  PgMacaddr: fake(() => faker.internet.mac(), "faker.internet.mac()"),
  PgMacaddr8: fake(() => faker.internet.mac(), "faker.internet.mac()"),
  PgNumeric: fake(() => faker.finance.amount({ max: 9 }), "faker.finance.amount({ max: 9 })"),
};

const textColumnTypes = new Set(["PgText", "PgVarchar", "PgChar", "PgEnumColumn", "PgEnumObjectColumn"]);

function stringDefault(column: PgColumn) {
  return textColumnTypes.has(column.columnType) ? textDefault(column) : byColumnType[column.columnType];
}

function textDefault(column: PgColumn): FactoryDefault {
  const [firstEnumValue] = column.enumValues ?? [];

  if (firstEnumValue !== undefined) return { value: () => firstEnumValue, source: JSON.stringify(firstEnumValue) };

  const unique = column.isUnique || column.primary;

  if (/email/i.test(column.name)) return unique ? uniqueEmail : email;
  if (unique) return uuid;

  return namedTexts.find(([pattern]) => pattern.test(column.name))?.[1] ?? words;
}

/**
 * The value a factory gives a required column it has no value for, and
 * the same value as factory source code. The column's type and name
 * pick a `@faker-js/faker` call; a `uuid` column and a unique text column
 * get a random UUID, and a unique email column a Faker email with a UUID
 * in it.
 *
 * Throws for a column type with no default (arrays, `interval`, `time`,
 * string-mode timestamps, custom types), naming the column.
 *
 * @internal Shared by {@link defineFactory} and `nuxvel factory:sync`;
 * not meant for app code.
 */
export function factoryDefault(column: PgColumn): FactoryDefault {
  const found = column.dataType === "string" ? stringDefault(column) : byType[column.dataType];

  if (!found) {
    throw new Error(
      `no factory default for column "${column.name}" (type "${column.getSQLType()}"); give it a value in the definition`,
    );
  }

  return found;
}
