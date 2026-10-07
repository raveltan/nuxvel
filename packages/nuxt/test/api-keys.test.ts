import { createHash } from "node:crypto";
import { describe, it } from "vitest";
import { actingAs, expect, expectMailSent, expectRow, guest } from "@nuxvel/nuxt/testing";
import { apiKeysTable } from "../../../playground/server/database/schema/api-keys.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "a-brand-new-long-passphrase";

function withKey(key: string, headers: Record<string, string> = {}) {
  return { headers: { authorization: `Bearer ${key}`, ...headers } };
}

describe("API keys", async () => {
  await setupPlayground();

  it("signs a REST and a tRPC call in as the key's owner, and stores only the key's hash", async () => {
    const owner = await userFactory({ email: "key-owner@example.com" });
    const { key, id } = await actingAs(owner).api.apiKeys.create({ name: "ci" });

    const rest = await guest().fetch("/api/v1/me", withKey(key));
    const trpc = await guest().fetch("/api/trpc/profile.me", withKey(key));

    expect(key).toMatch(/^nxk_/);
    expect(rest.status).toBe(200);
    expect(await rest.json()).toMatchObject({ email: "key-owner@example.com" });
    expect(trpc.status).toBe(200);
    const row = await expectRow(apiKeysTable, { id, keyHash: createHash("sha256").update(key).digest("hex") });
    expect(JSON.stringify(row)).not.toContain(key);
    expect(row.lastUsedAt).toBeInstanceOf(Date);
    expect(await actingAs(owner).api.apiKeys.list()).toEqual([expect.objectContaining({ id, name: "ci" })]);
  });

  it("signs fetch and api in with a key through actingAs with apiKey", async () => {
    const user = await userFactory({ email: "acting-key@example.com" });
    const client = actingAs(user, { apiKey: true });

    const response = await client.fetch("/api/v1/me");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: "acting-key@example.com" });
    await expect(client.api.profile.me()).resolves.toMatchObject({ email: "acting-key@example.com" });
    await expect(client.$fetch("/api/v1/me")).resolves.toMatchObject({ email: "acting-key@example.com" });
  });

  it("signs actingAs calls in with the key, so a procedure that refuses keys refuses them", async () => {
    const user = await userFactory();

    await expect(actingAs(user).api._sessionCheck.fresh()).resolves.toBe(user.email);
    await expect(actingAs(user, { apiKey: true }).api._sessionCheck.fresh()).rejects.toBeTrpcError("FORBIDDEN");
    expect((await actingAs(user, { apiKey: true }).fetch("/api/trpc/_sessionCheck.fresh")).status).toBe(403);
  });

  it("refuses a procedure that refuses keys when actingAs has apiKey", async () => {
    const admin = await userFactory({ role: "admin", twoFactorEnabled: true });

    await expect(actingAs(admin, { apiKey: true }).api.account.signUps()).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("deletes every key of the user on a password reset and on a password change", async () => {
    const owner = await userFactory.withPassword(PASSWORD)({ email: "recovering-owner@example.com" });
    const beforeReset = await actingAs(owner).api.apiKeys.create({ name: "stolen" });

    await postJson("/api/auth/request-password-reset", { email: owner.email, redirectTo: "/reset-password" });
    const { url } = await expectMailSent("nuxvel.auth.reset-password", { to: owner.email });
    const token = new URL(url).pathname.split("/").at(-1) ?? "";

    expect((await postJson("/api/auth/reset-password", { token, newPassword: NEW_PASSWORD })).status).toBe(200);
    expect((await guest().fetch("/api/v1/me", withKey(beforeReset.key))).status).toBe(401);

    const beforeChange = await actingAs(owner).api.apiKeys.create({ name: "stolen-again" });
    const cookie = sessionCookie(await postJson("/api/auth/sign-in/email", { email: owner.email, password: NEW_PASSWORD })) ?? "";

    expect((await postJson("/api/auth/change-password", { currentPassword: NEW_PASSWORD, newPassword: PASSWORD }, { cookie })).status).toBe(200);
    expect((await guest().fetch("/api/v1/me", withKey(beforeChange.key))).status).toBe(401);
  });

  it("answers a revoked, an expired and an unknown key with 401", async () => {
    const owner = await userFactory();
    const revoked = await actingAs(owner).api.apiKeys.create({ name: "revoked" });
    const expired = await actingAs(owner).api.apiKeys.create({ name: "old", expiresAt: new Date(Date.now() - 1000) });

    await actingAs(owner).api.apiKeys.revoke({ id: revoked.id });

    expect((await guest().fetch("/api/v1/me", withKey(revoked.key))).status).toBe(401);
    expect((await guest().fetch("/api/v1/me", withKey(expired.key))).status).toBe(401);
    expect((await guest().fetch("/api/v1/me", withKey("nxk_unknown"))).status).toBe(401);
    expect((await guest().fetch("/api/v1/me")).status).toBe(401);
  });

  it("skips the origin check for a key, but a key cannot manage keys", async () => {
    const { key } = await actingAs(await userFactory()).api.apiKeys.create({ name: "ci" });

    const response = await guest().fetch(
      "/api/trpc/apiKeys.create",
      { method: "POST", body: JSON.stringify({ json: { name: "minted" } }), ...withKey(key, { origin: "https://evil.example.com", "content-type": "application/json" }) },
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Manage API keys from a signed-in session");
  });

  it("limits each key to 60 calls a minute, with Retry-After", async () => {
    const { key } = await actingAs(await userFactory()).api.apiKeys.create({ name: "busy" });

    const statuses = [];
    for (let call = 0; call < 60; call++) statuses.push((await guest().fetch("/api/v1/me", withKey(key))).status);
    const limited = await guest().fetch("/api/v1/me", withKey(key));

    expect(new Set(statuses)).toEqual(new Set([200]));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
