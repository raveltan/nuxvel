import { describe, expect, it } from "vitest";
import { prependRow, removeRow, replaceRow } from "#imports";

const page = (ids: number[], total = ids.length) => ({
  rows: ids.map((id) => ({ id, title: `Post ${id}` })),
  page: 1,
  perPage: 2,
  total,
  lastPage: Math.max(1, Math.ceil(total / 2)),
});

describe("list patch helpers", () => {
  it("removeRow() drops the matching row and lowers total and lastPage", () => {
    expect(removeRow()(page([1, 2], 3), { id: 2 })).toEqual({ ...page([1], 2), rows: [{ id: 1, title: "Post 1" }] });
    expect(removeRow()(page([1]), { id: 9 })).toEqual(page([1]));
    expect(removeRow((row: { title: string }, title: string) => row.title === title)(page([1, 2]), "Post 1").rows).toEqual([{ id: 2, title: "Post 2" }]);
  });

  it("prependRow() adds the row on top within perPage, skips a duplicate and honours when", () => {
    expect(prependRow()(page([1, 2]), { id: 3, title: "Post 3" })).toEqual({ ...page([3, 1], 3) });
    expect(prependRow()(page([1, 2]), { id: 1, title: "Again" })).toEqual(page([1, 2]));
    expect(prependRow({ when: (list) => list.page > 1 })(page([1]), { id: 3, title: "Post 3" })).toEqual(page([1]));
  });

  it("replaceRow() merges the change into the matching row", () => {
    expect(replaceRow()(page([1, 2]), { id: 2, title: "Renamed" }).rows).toEqual([
      { id: 1, title: "Post 1" },
      { id: 2, title: "Renamed" },
    ]);
  });
});
