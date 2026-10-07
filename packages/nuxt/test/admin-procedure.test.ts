import { eq } from "drizzle-orm";
import { describe, it } from "vitest";
import { actingAs, expect, expectRow, guest, signIn } from "@nuxvel/nuxt/testing";
import { userTable } from "../../../playground/server/database/schema/auth.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { signUpWithTwoFactor } from "./helpers/auth-flows";
import { useTestDatabase } from "./helpers/database";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

describe("adminProcedure", async () => {
  await setupPlayground();
  const db = useTestDatabase();

  function makeAdmin(id: string) {
    return db.update(userTable).set({ role: "admin", twoFactorEnabled: true }).where(eq(userTable.id, id));
  }

  it("lets an admin with two-factor sign-in through", async () => {
    const admin = await userFactory({ role: "admin", twoFactorEnabled: true });

    await expect(actingAs(admin).api.account.signUps()).resolves.toEqual(expect.any(Array));
  });

  it("answers FORBIDDEN to actingAs with twoFactorVerified: false", async () => {
    const admin = await userFactory({ role: "admin", twoFactorEnabled: true });
    const client = actingAs(admin, { twoFactorVerified: false });

    await expect(client.api.account.signUps()).rejects.toBeTrpcError("FORBIDDEN");
    expect((await client.fetch("/api/trpc/account.signUps")).status).toBe(403);
  });

  it("lets twoFactorVerified: true through for an admin without two-factor sign-in", async () => {
    const admin = await userFactory({ role: "admin", twoFactorEnabled: false });

    await expect(actingAs(admin, { twoFactorVerified: true }).api.account.signUps()).resolves.toEqual(expect.any(Array));
  });

  it("answers FORBIDDEN to an admin without two-factor sign-in", async () => {
    const admin = await userFactory({ role: "admin", twoFactorEnabled: false });

    await expect(actingAs(admin).api.account.signUps()).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("answers FORBIDDEN to an admin with two-factor on whose session skipped the second factor", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "unverified-admin@example.com" });
    const session = await signIn(user.email, PASSWORD);
    await makeAdmin(user.id);

    const response = await session.fetch("/api/trpc/account.signUps");

    expect(response.status).toBe(403);
  });

  it("serves an admin on the session the TOTP confirmation started", async () => {
    const { cookie } = await signUpWithTwoFactor("verified-admin@example.com", PASSWORD);
    const row = await expectRow(userTable, { email: "verified-admin@example.com" });
    await makeAdmin(row.id);

    const response = await guest().fetch("/api/trpc/account.signUps", { headers: { cookie } });

    expect(response.status).toBe(200);
  });

  it("answers FORBIDDEN to an admin's API key", async () => {
    const admin = await userFactory({ role: "admin", twoFactorEnabled: true });
    const { key } = await actingAs(admin).api.apiKeys.create({ name: "ci" });

    const response = await guest().fetch("/api/trpc/account.signUps", { headers: { authorization: `Bearer ${key}` } });

    expect(response.status).toBe(403);
  });

  it("answers FORBIDDEN to a user without the admin role", async () => {
    const member = await userFactory({ twoFactorEnabled: true });

    await expect(actingAs(member).api.account.signUps()).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("answers UNAUTHORIZED to a guest", async () => {
    await expect(guest().api.account.signUps()).rejects.toBeTrpcError("UNAUTHORIZED");
  });
});
