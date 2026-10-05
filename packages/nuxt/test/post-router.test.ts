import { describe, it } from "vitest";

import { actingAs, expect, expectAudited, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("post tRPC router", async () => {
  await setupPlayground();

  it("lists publicly, lets an owner create and update, and rejects a non-owner", async () => {
    const owner = actingAs(await userFactory()).trpc;
    const other = actingAs(await userFactory()).trpc;

    const created = await owner.post.create({ title: "Hello", body: "World" });

    expect(created).toMatchObject({ title: "Hello", body: "World" });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect((await guest().trpc.post.list()).rows.map((post) => post.id)).toContain(created.id);

    const updated = await owner.post.update({
      id: created.id,
      title: "Updated",
      body: "Updated body",
    });

    expect(updated).toMatchObject({ id: created.id, title: "Updated", body: "Updated body" });
    await expect(
      other.post.update({ id: created.id, title: "Hacked", body: "Hacked body" }),
    ).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("lets an admin update someone else's post through the router", async () => {
    const created = await actingAs(await userFactory()).trpc.post.create({
      title: "Hello",
      body: "World",
    });
    const admin = actingAs(await userFactory({ role: "admin" })).trpc;

    const moderated = await admin.post.update({
      id: created.id,
      title: "Moderated",
      body: "Moderated body",
    });

    expect(moderated).toMatchObject({ id: created.id, title: "Moderated" });
    expect(await admin.post.abilities({ id: created.id })).toEqual({ update: true, delete: true });
  });

  it("soft-deletes and restores a post, audits both, and applies the policy to restore", async () => {
    const author = await userFactory();
    const owner = actingAs(author).trpc;
    const other = actingAs(await userFactory()).trpc;
    const created = await owner.post.create({ title: "Trash me", body: "" });
    const listed = async () => (await guest().trpc.post.list()).rows.map((post) => post.id);

    expect(await owner.post.delete({ id: created.id })).toEqual({ id: created.id });
    expect(await listed()).not.toContain(created.id);
    await expect(guest().trpc.post.byId({ id: created.id })).rejects.toBeTrpcError("NOT_FOUND");
    const deleted = await expectAudited("post.deleted", { actorId: author.id, targetId: String(created.id) });
    expect(deleted.changes).toEqual({ deletedAt: { from: null, to: expect.any(String) } });

    await expect(other.post.restore({ id: created.id })).rejects.toBeTrpcError("FORBIDDEN");
    expect(await owner.post.restore({ id: created.id })).toMatchObject({ id: created.id, deletedAt: null });
    expect(await listed()).toContain(created.id);
    const restored = await expectAudited("post.restored", { actorId: author.id, targetId: String(created.id) });
    expect(restored.changes).toEqual({ deletedAt: { from: expect.any(String), to: null } });

    await expect(owner.post.restore({ id: created.id })).rejects.toBeTrpcError("NOT_FOUND");
  });

  it("surfaces validation errors on bad create/update input", async () => {
    const owner = actingAs(await userFactory()).trpc;
    const created = await owner.post.create({ title: "Hello", body: "World" });

    await expect(owner.post.create({ title: "", body: "" })).rejects.toBeTrpcError("BAD_REQUEST");
    await expect(
      owner.post.update({ id: created.id, title: "", body: "" }),
    ).rejects.toBeTrpcError("BAD_REQUEST");
  });

  it("requires auth for create", async () => {
    await expect(
      guest().trpc.post.create({ title: "Nope", body: "Nope" }),
    ).rejects.toBeTrpcError("UNAUTHORIZED");
  });
});
