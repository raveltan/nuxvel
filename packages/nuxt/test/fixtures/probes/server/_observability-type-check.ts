import jobs from "#nuxvel/jobs";
import record from "~~/server/jobs/_probe/record";
import { allowRepeatedQueries } from "@nuxvel/nuxt/server/database";
import { renamed, useLogger } from "@nuxvel/nuxt/server/observability";

type IsAny<T> = 0 extends 1 & T ? true : false;

type Typed<T, Expected> = IsAny<T> extends true ? never : [T] extends [Expected] ? true : never;

type Logger = ReturnType<typeof useLogger>;

export const useLoggerIsTyped: Typed<Logger["info"], (...args: never[]) => void> = true;
export const useLoggerTagsAreTyped: Typed<ReturnType<Logger["withTag"]>, Logger> = true;

export function loggerRejectsUnknownLevels(logger: Logger) {
  // @ts-expect-error consola has no "shout" level
  logger.shout("probe");
}

type RepeatedResult = Awaited<ReturnType<typeof allowRepeatedQueries<{ count: number }>>>;

export const allowRepeatedQueriesKeepsTheResult: Typed<RepeatedResult, { count: number }> = true;

type Alias = ReturnType<typeof renamed<typeof record>>;

export const renamedPointsAtTheDefinition: Typed<Alias["renamedTo"], typeof record> = true;
export const renamedKeepsAName: Typed<Alias["name"], string> = true;

export const directlyImportedNameIsAString: Typed<typeof record.name, string> = true;

type RegisteredName = Extract<(typeof jobs)[number], { name: "_probe.record" }>["name"];

export const registeredNameIsTheLiteral: Typed<RegisteredName, "_probe.record"> = true;
export const registeredNameIsNotWidened: string extends RegisteredName ? never : true = true;
