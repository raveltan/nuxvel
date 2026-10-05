import { describe, it } from "vitest";
import { expect, expectRow, signIn } from "@nuxvel/nuxt/testing";
import { sessionTable } from "../../../playground/server/database/schema/auth.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

describe("signIn()", async () => {
  await setupPlayground();

  it("signs in with the password and reaches the app on that session", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "sign-in-helper@example.com" });
    const client = await signIn(user.email, PASSWORD);

    expect((await client.fetch("/api/trpc/profile.me")).status).toBe(200);
    await expect(client.trpc.profile.me()).resolves.toMatchObject({ email: "sign-in-helper@example.com" });
  });

  it("sends the headers with the sign-in and with each later call", async () => {
    const user = await userFactory.withPassword(PASSWORD)();
    const client = await signIn(user.email, PASSWORD, { headers: { "user-agent": "sign-in-helper-phone" } });

    await expectRow(sessionTable, { userId: user.id, userAgent: "sign-in-helper-phone" });

    const { context } = await client.$fetch("/api/_audit-subjects-check");

    expect(context).toEqual([expect.objectContaining({ userAgent: "sign-in-helper-phone" })]);
  });

  it("rejects a wrong password", async () => {
    const user = await userFactory.withPassword(PASSWORD)();

    await expect(signIn(user.email, "wrong-password-123")).rejects.toThrow("signIn: the app refused");
  });

  it("rejects a user with two-factor sign-in on", async () => {
    const user = await userFactory.withTwoFactor(PASSWORD)();

    await expect(signIn(user.email, PASSWORD)).rejects.toThrow("two-factor");
  });
});
