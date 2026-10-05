import { z } from "zod";
import { paginationSchema } from "./pagination";

/**
 * How a list filters one column: `"text"` (contains, case-insensitive),
 * `"boolean"`, `"dateRange"`, or the allowed values of a select.
 */
export type ListFilterKind = "text" | "boolean" | "dateRange" | readonly [string, ...string[]];

/** A range of dates, `YYYY-MM-DD`, both ends included. Either end may be open. */
export interface DateRange {
  from?: string;
  to?: string;
}

/** One sort term of a list: a column and its direction. */
export interface ListSort<TColumn extends string = string> {
  column: TColumn;
  direction: "asc" | "desc";
}

/** The parsed value of a filter of the given {@link ListFilterKind}. */
export type ListFilterValue<TKind extends ListFilterKind> = TKind extends "text"
  ? string
  : TKind extends "boolean"
    ? boolean
    : TKind extends "dateRange"
      ? DateRange
      : TKind extends readonly (infer TValue)[]
        ? TValue[]
        : never;

/** The active filters of a list, by column. A filter that is not set is left out. */
export type ListFilters<TFilters extends Record<string, ListFilterKind>> = {
  [K in keyof TFilters]?: ListFilterValue<TFilters[K]>;
};

/**
 * The input a {@link listQuery} schema parses: the page, the search text,
 * the sort terms and the active filters.
 */
export interface ListQuery<TSort extends string = string, TFilters extends Record<string, ListFilterKind> = Record<string, ListFilterKind>> {
  page?: number;
  perPage?: number;
  q?: string;
  sort: ListSort<TSort>[];
  filters: ListFilters<TFilters>;
}

type FlatFilters<TFilters extends Record<string, ListFilterKind>> = {
  [K in keyof TFilters]?: TFilters[K] extends readonly string[] ? string | string[] : string;
};

type ListQueryParams<TFilters extends Record<string, ListFilterKind>> = {
  page?: string | number;
  perPage?: string | number;
  q?: string;
  sort?: string | string[];
} & FlatFilters<TFilters>;

type ParsedInput = { page?: number; perPage?: number; q?: string; sort?: ListSort[] } & Record<string, unknown>;

const reservedKeys = ["page", "perPage", "q", "sort", "edit"];
const maxSortTerms = 3;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function fail(ctx: z.core.$RefinementCtx, input: unknown, message: string) {
  ctx.addIssue({ code: "custom", message, input });

  return z.NEVER;
}

function listValues(value: string | string[]) {
  return (Array.isArray(value) ? value : [value])
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function sortField(columns: readonly string[]) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value, ctx) => {
      const terms: ListSort[] = [];

      for (const term of value === undefined ? [] : listValues(value)) {
        const [column = "", direction = "asc", ...rest] = term.split(":");

        if (!columns.includes(column)) return fail(ctx, value, `"${column}" is not a sortable column`);
        if (rest.length > 0 || (direction !== "asc" && direction !== "desc")) {
          return fail(ctx, value, `"${term}" must be a column, optionally followed by :asc or :desc`);
        }
        if (terms.some((existing) => existing.column === column)) return fail(ctx, value, `"${column}" is sorted two times`);

        terms.push({ column, direction });
      }

      if (terms.length > maxSortTerms) return fail(ctx, value, `Sort by at most ${maxSortTerms} columns`);

      return terms;
    });
}

function dateRange(value: string, ctx: z.core.$RefinementCtx): DateRange | undefined {
  if (value.trim() === "") return undefined;

  const [from = "", to = "", ...rest] = value.split("..");
  const valid = (date: string) => date === "" || (datePattern.test(date) && !Number.isNaN(Date.parse(date)));

  if (rest.length > 0 || !value.includes("..") || !valid(from) || !valid(to)) {
    return fail(ctx, value, "Use from..to with dates like 2026-01-31, either one may be left out");
  }
  if (from !== "" && to !== "" && from > to) return fail(ctx, value, "The start date is after the end date");

  return { ...(from && { from }), ...(to && { to }) };
}

function filterField(kind: ListFilterKind) {
  if (kind === "text") return z.string().max(255).transform((value) => value.trim() || undefined).optional();
  if (kind === "boolean") return z.enum(["true", "false", ""]).transform((value) => (value === "" ? undefined : value === "true")).optional();
  if (kind === "dateRange") return z.string().transform(dateRange).optional();

  return z
    .union([z.string(), z.array(z.string())])
    .transform((value, ctx) => {
      const values = [...new Set(listValues(value))];
      const unknown = values.find((item) => !kind.includes(item));

      if (unknown !== undefined) return fail(ctx, value, `"${unknown}" is not one of: ${kind.join(", ")}`);

      return values.length === 0 ? undefined : values;
    })
    .optional();
}

function checkOptions(sort: readonly string[], filters: Record<string, ListFilterKind>) {
  for (const [key, kind] of Object.entries(filters)) {
    if (reservedKeys.includes(key)) throw new Error(`listQuery: the filter "${key}" clashes with a list parameter. Rename it: ${reservedKeys.join(", ")} are taken`);
    if (Array.isArray(kind) && (kind.length === 0 || kind.some((value) => value === "" || value.includes(",")))) {
      throw new Error(`listQuery: the values of the filter "${key}" must be non-empty and contain no comma`);
    }
  }
  for (const column of sort) {
    if (column === "" || column.includes(":") || column.includes(",")) throw new Error(`listQuery: "${column}" is not a valid sort column`);
  }
}

/**
 * Builds the input schema of a list that sorts and filters on the
 * server: `page`, `perPage` and `q` from {@link paginationSchema}, plus
 * `sort` and one flat key per filter.
 *
 * Auto-imported in `shared/`, on the server and in the app. The input is
 * flat, so it is the page's `route.query`, the tRPC input and the REST
 * query string alike: `?sort=title:asc,createdAt:desc&status=open,done&done=true&dueOn=2026-01-01..2026-01-31&title=report`.
 * It parses to a {@link ListQuery}: `sort` as {@link ListSort} terms and
 * the set filters under `filters`. A sort column that is not listed, a
 * select value that is not allowed or a malformed date fails validation
 * on that key. No input at all parses to an empty query. Apply the result
 * with `listWhere()` and `listOrderBy()`, and turn it back into query
 * parameters with {@link listQueryParams}. Filter keys may not be `page`,
 * `perPage`, `q`, `sort` or `edit`.
 *
 * @param options.sort The columns a caller may sort by, at most three at a time.
 * @param options.filters The filter of each filterable column, by column key.
 *
 * @example
 * ```ts
 * export const taskListInput = listQuery({
 *   sort: ["id", "title", "dueOn"],
 *   filters: { title: "text", status: ["open", "done"], urgent: "boolean", dueOn: "dateRange" },
 * });
 * ```
 */
export function listQuery<
  const TSort extends readonly string[] = [],
  const TFilters extends Record<string, ListFilterKind> = Record<never, ListFilterKind>,
>(options: { sort?: TSort; filters?: TFilters } = {}) {
  const sort = options.sort ?? [];
  const filters = options.filters ?? ({} as TFilters);

  checkOptions(sort, filters);

  const filterShape = Object.fromEntries(Object.entries(filters).map(([key, kind]) => [key, filterField(kind)]));

  // Object.fromEntries loses the filter keys, so zod infers a loose input that the cast narrows to ListQueryParams<TFilters>
  return z
    .object({ ...paginationSchema.shape, sort: sortField(sort), ...filterShape })
    .optional()
    .transform((input): ListQuery<TSort[number], TFilters> => {
      const { page, perPage, q, sort: terms = [], ...rest } = (input ?? {}) as ParsedInput;
      const active = Object.fromEntries(Object.entries(rest).filter(([key, value]) => key in filters && value !== undefined));

      return { page, perPage, q: q || undefined, sort: terms as ListSort<TSort[number]>[], filters: active as ListFilters<TFilters> };
    }) as z.ZodType<ListQuery<TSort[number], TFilters>, ListQueryParams<TFilters> | undefined>;
}

/**
 * Turns a {@link ListQuery} back into the flat query parameters that a
 * {@link listQuery} schema parses, for `router.push({ query })` or a
 * link.
 *
 * Auto-imported in `shared/`, on the server and in the app. Parameters
 * that are not set are left out, so `?page=1` and empty filters do not
 * clutter the URL.
 *
 * @example
 * ```ts
 * router.push({ query: { ...listQueryParams({ ...query, sort: [{ column: "title", direction: "asc" }], page: 1 }) } });
 * ```
 */
export function listQueryParams(query: Partial<ListQuery>): Record<string, string> {
  const params: Record<string, string> = {};

  if (query.page !== undefined && query.page > 1) params.page = String(query.page);
  if (query.perPage !== undefined) params.perPage = String(query.perPage);
  if (query.q) params.q = query.q;
  if (query.sort && query.sort.length > 0) params.sort = query.sort.map(({ column, direction }) => `${column}:${direction}`).join(",");

  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (value === undefined) continue;
    if (typeof value === "string" || typeof value === "boolean") params[key] = String(value);
    else if (Array.isArray(value)) {
      if (value.length > 0) params[key] = value.join(",");
    } else if (value.from || value.to) params[key] = `${value.from ?? ""}..${value.to ?? ""}`;
  }

  return params;
}
