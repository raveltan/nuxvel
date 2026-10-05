import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expect, expectCount, expectNoRow, expectRow, expectSoftDeleted } from "@nuxvel/nuxt/testing";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";

describe("expectNoRow() / expectCount()", () => {
  it("expectNoRow passes with no matching row and fails with one", async () => {
    const name = `missing-${randomUUID()}`;

    await expectNoRow(healthChecksTable, { name });
    await healthCheckFactory({ name });

    await expect(expectNoRow(healthChecksTable, { name })).rejects.toThrow(`a row matches {"name":"${name}"}`);
  });

  it("expectCount passes on the exact count and fails on another", async () => {
    const name = `count-${randomUUID()}`;
    await healthCheckFactory({ name });
    await healthCheckFactory({ name });

    await expectCount(healthChecksTable, 2, { name });
    await expect(expectCount(healthChecksTable, 3, { name })).rejects.toThrow("expected 2 to be 3");
  });

  it("expectRow lists the rows that match the most columns when none matches", async () => {
    const name = `closest-${randomUUID()}`;
    const row = await healthCheckFactory({ name });

    const failure = await expectRow(healthChecksTable, { name, id: row.id + 1000 }).catch((error: Error) => error.message);

    expect(failure).toContain(`no row matches {"name":"${name}","id":${row.id + 1000}}`);
    expect(failure).toContain(`Closest rows: {"name":"${name}","id":${row.id}}`);
  });

  it("expectSoftDeleted returns a trashed row and rejects a live one", async () => {
    const author = await userFactory();
    const trashed = await postFactory.for("authorId", author).trashed()();
    const live = await postFactory.for("authorId", author)();

    expect((await expectSoftDeleted(postsTable, { id: trashed.id })).deletedAt).toBeInstanceOf(Date);
    await expect(expectSoftDeleted(postsTable, { id: live.id })).rejects.toThrow("expectSoftDeleted: no soft-deleted row matches");
  });
});
