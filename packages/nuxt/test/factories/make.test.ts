import { describe, it } from "vitest";
import { expect, expectNoRow } from "@nuxvel/nuxt/testing";
import { userTable } from "../../../../playground/server/database/schema/auth.schema";
import { userFactory } from "../../../../playground/server/factories/users.factory";

describe("factory .make()", () => {
  it("returns the insert object without inserting a row", async () => {
    const values = await userFactory.make({ name: "Made" });

    expect(values).toMatchObject({ name: "Made", email: expect.stringMatching(/@example\.com$/) });
    await expectNoRow(userTable, { id: values.id });

    const inserted = await userFactory(values);

    expect(inserted).toMatchObject({ id: values.id, email: values.email });
  });
});
