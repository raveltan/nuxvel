import { actingAs, expect, expectStored, guest } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";
import { ensureBucket } from "./helpers/storage";
import { TEST_STORAGE_BUCKET } from "./setup/constants";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const avatar = () => new File([PNG], "avatar.png", { type: "image/png" });

describe("client.upload(name, file)", async () => {
  await setupPlayground();

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("uploads the file and returns its tmp key", async () => {
    const key = await actingAs(await userFactory()).upload("profile-avatar", avatar());

    expect(key.startsWith("tmp/profile-avatar/")).toBe(true);
    expect((await expectStored(key)).size).toBe(PNG.byteLength);
  });

  it("rejects with the status of a refused upload URL", async () => {
    await expect(guest().upload("profile-avatar", avatar())).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      actingAs(await userFactory()).upload("profile-avatar", new File(["x"], "a.html", { type: "text/html" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
