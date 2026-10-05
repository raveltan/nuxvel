import { randomUUID } from "node:crypto";
import { beforeAll, describe, it } from "vitest";
import { actingAs, expect, expectNotStored, guest, runAction } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { ensureBucket, putObject, storedObjectSize } from "./helpers/storage";
import { TEST_STORAGE_BUCKET } from "./setup/constants";
import { setupPlayground } from "./helpers/playground";

const PNG = Buffer.concat([
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
  Buffer.alloc(186),
]);

function file(body: Uint8Array) {
  return new File([body], "file.png", { type: "image/png" });
}

describe("promoteUpload() / signedReadUrl()", async () => {
  await setupPlayground();

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("moves an upload out of tmp/ and signs a URL that reads it", async () => {
    const user = await userFactory();
    const tmpKey = await actingAs(user).upload("profile-avatar", file(PNG));

    expect(tmpKey).toMatch(new RegExp(`^tmp/profile-avatar/${user.id}/`));

    const { key } = await runAction("profile.set-avatar", { key: tmpKey }, { actingAs: user });

    expect(key).toMatch(new RegExp(`^avatars/${user.id}/`));
    expect(await storedObjectSize(TEST_STORAGE_BUCKET, key)).toBe(PNG.byteLength);
    await expectNotStored(tmpKey);

    const { avatarUrl } = await actingAs(user).trpc.profile.me();
    const read = await globalThis.fetch(avatarUrl ?? "");

    expect(read.status).toBe(200);
    expect((await read.arrayBuffer()).byteLength).toBe(PNG.byteLength);
  });

  it("refuses a key another upload issued, leaving it in place", async () => {
    const user = await userFactory();
    const tmpKey = await actingAs(user).upload("_avatar", file(PNG));

    await expect(
      runAction("profile.set-avatar", { key: tmpKey }, { actingAs: user }),
    ).rejects.toHaveValidationErrors("key");
    expect(await storedObjectSize(TEST_STORAGE_BUCKET, tmpKey)).toBe(PNG.byteLength);
  });

  it("refuses and deletes a file named .png whose bytes are text", async () => {
    const user = await userFactory();
    const tmpKey = await actingAs(user).upload("profile-avatar", file(new TextEncoder().encode("this is not a png")));

    const refused = runAction("profile.set-avatar", { key: tmpKey }, { actingAs: user });

    await expect(refused).rejects.toHaveValidationErrors("key");
    await expect(refused).rejects.toMatchObject({ fields: { key: ["The file's content is not image/png"] } });
    await expectNotStored(tmpKey);
  });

  it("refuses the upload of another user, leaving it in place", async () => {
    const [owner, other] = [await userFactory(), await userFactory()];
    const tmpKey = await actingAs(owner).upload("profile-avatar", file(PNG));

    await expect(
      runAction("profile.set-avatar", { key: tmpKey }, { actingAs: other }),
    ).rejects.toMatchObject({ fields: { key: ["Another user uploaded this file"] } });
    expect(await storedObjectSize(TEST_STORAGE_BUCKET, tmpKey)).toBe(PNG.byteLength);
  });

  it("promotes the upload of a guest for any user", async () => {
    const tmpKey = `tmp/profile-avatar/${randomUUID()}`;

    await putObject(TEST_STORAGE_BUCKET, tmpKey, PNG, "image/png");

    const { key } = await runAction("profile.set-avatar", { key: tmpKey }, { actingAs: await userFactory() });

    expect(await storedObjectSize(TEST_STORAGE_BUCKET, key)).toBe(PNG.byteLength);
  });

  it("refuses a key with no stored file, such as a file it refused before", async () => {
    const user = await userFactory();

    await expect(
      runAction("profile.set-avatar", { key: `tmp/profile-avatar/${randomUUID()}` }, { actingAs: user }),
    ).rejects.toMatchObject({ fields: { key: ["The file is not in storage. Upload it again"] } });
  });

  it("refuses and deletes a stored file larger than the upload's maxSize", async () => {
    const user = await userFactory();
    const tmpKey = `tmp/profile-avatar/${randomUUID()}`;

    await putObject(TEST_STORAGE_BUCKET, tmpKey, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), "image/png");

    const refused = runAction("profile.set-avatar", { key: tmpKey }, { actingAs: user });

    await expect(refused).rejects.toMatchObject({ fields: { key: ["The file is larger than 2097152 bytes"] } });
    await expectNotStored(tmpKey);
  });

  it("refuses a file that the browser sends again after the check, and moves nothing", async () => {
    expect(await guest().$fetch("/api/_promote-swap-check", { method: "POST" })).toEqual({
      refused: { key: ["The file changed after the check. Upload it again"] },
      moved: false,
    });
  });

  it.for(["tmp/profile-avatar/kept", "backups/audit/x.jsonl.gz", "//backups//audit/x.jsonl.gz"])(
    "refuses to move a file to %s, leaving it in tmp/",
    async (to) => {
      const key = `tmp/profile-avatar/${randomUUID()}`;

      await putObject(TEST_STORAGE_BUCKET, key, PNG, "image/png");

      const { refused } = await guest().$fetch("/api/_promote-to-check", { method: "POST", body: { key, to } });

      expect(refused).toContain(`promoteUpload() does not move a file to ${to}`);
      expect(await storedObjectSize(TEST_STORAGE_BUCKET, key)).toBe(PNG.byteLength);
    },
  );

  it("checks an upload without moving it, and deletes a refused one", async () => {
    const client = actingAs(await userFactory());
    const goodKey = await client.upload("profile-avatar", file(PNG));
    const badKey = await client.upload("profile-avatar", file(new TextEncoder().encode("this is not a png")));
    const check = (key: string) => client.$fetch("/api/_check-upload-check", { method: "POST", body: { key } });

    expect(await check(goodKey)).toEqual({ fields: {} });
    expect(await storedObjectSize(TEST_STORAGE_BUCKET, goodKey)).toBe(PNG.byteLength);
    expect(await check(badKey)).toEqual({ fields: { key: ["The file's content is not image/png"] } });
    await expectNotStored(badKey);
  });

  it("signs SVG and HTML files as attachments and a PNG inline, each private to the browser", async () => {
    const stored = [
      { key: `read-test/${randomUUID()}.svg`, type: "image/svg+xml", body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      { key: `read-test/${randomUUID()}.html`, type: "text/html", body: Buffer.from("<script>alert(1)</script>") },
      { key: `read-test/${randomUUID()}.png`, type: "image/png", body: PNG },
    ];

    const dispositions = await Promise.all(
      stored.map(async ({ key, type, body }) => {
        await putObject(TEST_STORAGE_BUCKET, key, body, type);
        const { url } = await guest().$fetch<{ url: string }>("/api/_signed-read-url-check", { query: { key } });
        const read = await globalThis.fetch(url);

        expect(read.status).toBe(200);

        return [read.headers.get("content-disposition"), read.headers.get("cache-control")];
      }),
    );

    expect(dispositions).toEqual([
      ["attachment", "private"],
      ["attachment", "private"],
      [null, "private"],
    ]);
  });

  it("refuses to sign a key under backups/audit/, with or without extra slashes", async () => {
    for (const key of ["backups/audit/x.jsonl.gz", "//backups//audit/x.jsonl.gz"]) {
      const response = await guest().fetch(`/api/_signed-read-url-check?key=${encodeURIComponent(key)}`);

      expect(response.status).toBe(500);
    }
  });
});
