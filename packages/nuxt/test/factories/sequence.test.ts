import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../../playground/server/factories/users.factory";

describe("factory sequence()", () => {
  it("never collides on a unique column across two factory-created rows", async () => {
    const first = await userFactory();
    const second = await userFactory();

    expect(first.email).not.toBe(second.email);
  });
});
