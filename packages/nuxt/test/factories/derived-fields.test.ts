import { defineFactory, sequence } from "@nuxvel/nuxt/factories";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable } from "../../../../playground/server/database/schema/auth.schema";

const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;

describe("factory fields that read other fields", () => {
  it("gives a function with a parameter the row after every other column is set, whatever the key order", async () => {
    const userFactory = defineFactory(userTable, {
      email: (user) => `${user.id}-${emailFor(user.name)}`,
      id: () => crypto.randomUUID(),
      name: "Ada Lovelace",
    });

    const user = await userFactory();

    expect(user.email).toBe(`${user.id}-ada.lovelace@example.com`);
  });

  it("reads a per-call override, a .state() value and a Faker default", async () => {
    const userFactory = defineFactory(userTable, { email: (user) => `${user.id}-${emailFor(user.name)}` });

    const overridden = await userFactory({ name: "Grace Hopper" });
    const stated = await userFactory.state({ name: () => "Alan Turing" })();
    const defaulted = await userFactory();

    expect(overridden.email).toBe(`${overridden.id}-grace.hopper@example.com`);
    expect(stated.email).toBe(`${stated.id}-alan.turing@example.com`);
    expect(defaulted.email).toBe(`${defaulted.id}-${emailFor(defaulted.name)}`);
  });

  it("lets a per-call override of the derived column win", async () => {
    const userFactory = defineFactory(userTable, { email: (user) => emailFor(user.name) });

    const user = await userFactory({ name: "Ada Lovelace", email: "ada@example.org" });

    expect(user.email).toBe("ada@example.org");
  });

  it("gives a sequence() the row as its second argument", async () => {
    const userFactory = defineFactory(userTable, {
      email: sequence((n, user) => `${emailFor(user.name).replace("@", `.${n}@`)}`),
      name: "Ada Lovelace",
    });

    const first = await userFactory();
    const second = await userFactory();

    expect(first.email).toMatch(/^ada\.lovelace\.\d+@example\.com$/);
    expect(second.email).not.toBe(first.email);
  });

  it("runs derived fields in definition order, so one can read another above it", async () => {
    const userFactory = defineFactory(userTable, {
      name: "Ada Lovelace",
      image: (user) => `https://example.com/${user.name.split(" ")[0]}.png`,
      email: (user) => `${crypto.randomUUID()}-${user.image?.slice(20, 23)}@example.com`,
    });

    const user = await userFactory();

    expect(user.image).toBe("https://example.com/Ada.png");
    expect(user.email).toMatch(/-Ada@example\.com$/);
  });
});
