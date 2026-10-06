import { describe, expect, it } from "vitest";
import { unwrapAuth } from "#imports";

describe("unwrapAuth()", () => {
  it("returns the data of a call Better Auth accepted", () => {
    expect(unwrapAuth({ data: { status: true }, error: null }, "Could not save")).toEqual({ status: true });
  });

  it("throws Better Auth's message, with its error as the cause", () => {
    const error = { message: "Invalid password", code: "INVALID_PASSWORD", status: 400 };

    expect(() => unwrapAuth({ data: null, error }, "Could not turn on two-factor sign-in")).toThrow(
      expect.objectContaining({ message: "Invalid password", cause: error }),
    );
  });

  it("throws the fallback when Better Auth gives no message", () => {
    const error = { status: 500 };

    expect(() => unwrapAuth({ data: null, error }, "Could not sign out that session")).toThrow("Could not sign out that session");
  });
});
