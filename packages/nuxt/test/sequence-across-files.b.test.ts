import { expect } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { unresetUserFactory, useUnresetUsersTable } from "./helpers/unreset-users";

describe("sequence() across test files (file b)", () => {
  beforeAll(useUnresetUsersTable);

  it("creates users whose emails no other file or run has used", async () => {
    const users = [await unresetUserFactory(), await unresetUserFactory(), await unresetUserFactory()];

    expect(new Set(users.map((user) => user.email)).size).toBe(3);
  });
});
