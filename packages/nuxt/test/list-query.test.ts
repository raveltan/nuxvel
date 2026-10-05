import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { paginationSchema } from "../src/runtime/shared/pagination/pagination";
import { listQuery, listQueryParams } from "../src/runtime/shared/pagination/list-query";

const taskList = listQuery({
  sort: ["id", "title", "dueOn"],
  filters: { title: "text", status: ["open", "done"], urgent: "boolean", dueOn: "dateRange" },
});

function issues(input: unknown) {
  const result = taskList.safeParse(input);

  return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

describe("listQuery()", () => {
  it("parses no input to an empty query", () => {
    expect(taskList.parse(undefined)).toEqual({ page: undefined, perPage: undefined, q: undefined, sort: [], filters: {} });
    expect(taskList.parse({})).toMatchObject({ sort: [], filters: {} });
  });

  it("coerces the page from a query string, like paginationSchema", () => {
    expect(taskList.parse({ page: "2", perPage: "10", q: " report " })).toMatchObject({ page: 2, perPage: 10, q: "report" });
  });

  describe("sort", () => {
    it("parses multi-column terms, defaulting to ascending", () => {
      expect(taskList.parse({ sort: "title:desc,dueOn" }).sort).toEqual([
        { column: "title", direction: "desc" },
        { column: "dueOn", direction: "asc" },
      ]);
      expect(taskList.parse({ sort: ["title:asc", "id:desc"] }).sort).toEqual([
        { column: "title", direction: "asc" },
        { column: "id", direction: "desc" },
      ]);
    });

    it("rejects a column that is not whitelisted", () => {
      expect(issues({ sort: "ownerId:asc" })).toEqual([{ path: "sort", message: '"ownerId" is not a sortable column' }]);
      expect(issues({ sort: "title:asc,password" })).toEqual([{ path: "sort", message: '"password" is not a sortable column' }]);
    });

    it("rejects a bad direction, a repeated column and too many terms", () => {
      expect(issues({ sort: "title:up" })[0]?.message).toContain("must be a column");
      expect(issues({ sort: "title:asc:x" })[0]?.message).toContain("must be a column");
      expect(issues({ sort: "title,title:desc" })[0]?.message).toBe('"title" is sorted two times');
      expect(
        issues({ sort: "id,title,dueOn" }),
      ).toEqual([]);
      expect(
        listQuery({ sort: ["a", "b", "c", "d"] }).safeParse({ sort: "a,b,c,d" }).success,
      ).toBe(false);
    });

    it("rejects sorting when no column is sortable", () => {
      expect(listQuery().safeParse({ sort: "id" }).success).toBe(false);
    });
  });

  describe("filters", () => {
    it("text: trims, and leaves an empty value out", () => {
      expect(taskList.parse({ title: "  report " }).filters).toEqual({ title: "report" });
      expect(taskList.parse({ title: "   " }).filters).toEqual({});
      expect(issues({ title: "x".repeat(256) })[0]?.path).toBe("title");
    });

    it("select: takes allowed values as a list, a comma string or repeated keys", () => {
      expect(taskList.parse({ status: "open" }).filters).toEqual({ status: ["open"] });
      expect(taskList.parse({ status: "open,done,open" }).filters).toEqual({ status: ["open", "done"] });
      expect(taskList.parse({ status: ["done"] }).filters).toEqual({ status: ["done"] });
      expect(taskList.parse({ status: "" }).filters).toEqual({});
      expect(issues({ status: "open,archived" })).toEqual([{ path: "status", message: '"archived" is not one of: open, done' }]);
    });

    it("boolean: takes true, false or empty", () => {
      expect(taskList.parse({ urgent: "true" }).filters).toEqual({ urgent: true });
      expect(taskList.parse({ urgent: "false" }).filters).toEqual({ urgent: false });
      expect(taskList.parse({ urgent: "" }).filters).toEqual({});
      expect(issues({ urgent: "yes" })[0]?.path).toBe("urgent");
    });

    it("dateRange: takes from..to with either end open", () => {
      expect(taskList.parse({ dueOn: "2026-01-01..2026-01-31" }).filters).toEqual({ dueOn: { from: "2026-01-01", to: "2026-01-31" } });
      expect(taskList.parse({ dueOn: "2026-01-01.." }).filters).toEqual({ dueOn: { from: "2026-01-01" } });
      expect(taskList.parse({ dueOn: "..2026-01-31" }).filters).toEqual({ dueOn: { to: "2026-01-31" } });
      expect(taskList.parse({ dueOn: "" }).filters).toEqual({});
    });

    it("dateRange: rejects a malformed or reversed range", () => {
      for (const value of ["2026-01-01", "2026-13-01..", "01/02/2026..", "a..b..c"]) {
        expect(issues({ dueOn: value })[0]?.path, value).toBe("dueOn");
      }
      expect(issues({ dueOn: "2026-02-01..2026-01-01" })).toEqual([{ path: "dueOn", message: "The start date is after the end date" }]);
    });

    it("ignores unknown query keys, such as ?edit=", () => {
      expect(taskList.parse({ edit: "12", ownerId: "x" }).filters).toEqual({});
    });
  });

  it("refuses options that would clash with the URL or the syntax", () => {
    expect(() => listQuery({ filters: { page: "text" } })).toThrow(/clashes/);
    expect(() => listQuery({ filters: { edit: "boolean" } })).toThrow(/clashes/);
    expect(() => listQuery({ filters: { status: ["a,b"] } })).toThrow(/no comma/);
    expect(() => listQuery({ sort: ["a:b"] })).toThrow(/not a valid sort column/);
  });
});

describe("listQueryParams()", () => {
  it("round-trips through listQuery", () => {
    const query = taskList.parse({
      page: "3",
      q: "report",
      sort: "title:desc,id",
      title: "draft",
      status: "open,done",
      urgent: "false",
      dueOn: "..2026-01-31",
    });
    const params = listQueryParams(query);

    expect(params).toEqual({
      page: "3",
      q: "report",
      sort: "title:desc,id:asc",
      title: "draft",
      status: "open,done",
      urgent: "false",
      dueOn: "..2026-01-31",
    });
    expect(taskList.parse(params)).toEqual(query);
  });

  it("leaves out page 1 and unset values", () => {
    expect(listQueryParams({ page: 1, sort: [], filters: { status: [] } })).toEqual({});
  });
});

describe("paginationSchema", () => {
  it("accepts a q of 200 characters and rejects one of 201", () => {
    expect(paginationSchema.safeParse({ q: "a".repeat(200) }).success).toBe(true);
    expect(paginationSchema.safeParse({ q: "a".repeat(201) }).success).toBe(false);
  });
});
