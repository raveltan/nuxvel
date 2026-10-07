import { beforeAll, describe, it } from "vitest";
import { actingAs, expect, expectNotStored, guest, type TestClient } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { ensureBucket, storedObjectSize } from "./helpers/storage";
import { TEST_STORAGE_BUCKET } from "./setup/constants";
import { setupPlayground } from "./helpers/playground";

type PresignedUpload = {
  url: string;
  key: string;
  headers: Record<string, string>;
};

function requestUploadUrl(
  name: string,
  body: { type: string; size: number },
  send: TestClient["fetch"] = guest().fetch,
) {
  return send(`/api/uploads/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("defineUpload()", async () => {
  await setupPlayground();

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("issues a presigned URL that accepts the declared file", async () => {
    const response = await requestUploadUrl("_avatar", {
      type: "image/png",
      size: 512,
    });

    expect(response.status).toBe(200);

    const presigned = (await response.json()) as PresignedUpload;

    expect(presigned.key).toMatch(/^tmp\/_avatar\/[0-9a-f-]{36}$/);

    const put = await globalThis.fetch(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
      body: new Uint8Array(512),
    });

    expect(put.status).toBe(200);
    expect(await storedObjectSize(TEST_STORAGE_BUCKET, presigned.key)).toBe(512);
  });

  it("has storage reject a file larger than the one declared", async () => {
    const response = await requestUploadUrl("_avatar", {
      type: "image/png",
      size: 512,
    });
    const presigned = (await response.json()) as PresignedUpload;

    const put = await globalThis.fetch(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
      body: new Uint8Array(4096),
    });

    expect(put.status).toBe(403);
    await expectNotStored(presigned.key);
  });

  it("rejects a request over a maxSize given as \"1 KB\", 1024 bytes, before issuing a URL", async () => {
    const response = await requestUploadUrl("_avatar", {
      type: "image/png",
      size: 2048,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      statusCode: 400,
      data: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fields: { size: ["Must be at most 1024 bytes"] },
      },
    });
  });

  it("rejects a disallowed type before issuing a URL", async () => {
    const response = await requestUploadUrl("_avatar", {
      type: "image/svg+xml",
      size: 512,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      statusCode: 400,
      data: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fields: { type: ["Must be one of image/png, image/jpeg"] },
      },
    });
  });

  it("answers 404 for an upload nothing defines", async () => {
    const response = await requestUploadUrl("missing", {
      type: "image/png",
      size: 512,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      data: { code: "NOT_FOUND", message: 'No upload is named "missing"' },
    });
  });

  it("answers 403 to a guest when the upload leaves out authorize", async () => {
    const response = await requestUploadUrl("profile-avatar", {
      type: "image/png",
      size: 512,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      data: { code: "FORBIDDEN", message: 'Not allowed to upload "profile-avatar"' },
    });
  });

  it("issues a URL to a signed-in user when the upload leaves out authorize", async () => {
    const user = await userFactory({ email: "upload-authorized@example.com", name: "Upload User" });
    const response = await requestUploadUrl(
      "profile-avatar",
      { type: "image/png", size: 512 },
      actingAs(user).fetch,
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as PresignedUpload).key).toMatch(
      /^tmp\/profile-avatar\/[^/]+\/[0-9a-f-]{36}$/,
    );
  });

  it("answers 429 once a guest passes the upload's rate limit", async () => {
    const statuses = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      statuses.push((await requestUploadUrl("_rate-limited", { type: "image/png", size: 512 })).status);
    }

    expect(statuses).toEqual([200, 200, 429]);
    expect((await requestUploadUrl("_avatar", { type: "image/png", size: 512 })).status).toBe(200);
  });

  it("answers 429 after 30 requests in a minute to an upload with no rateLimit", async () => {
    const statuses = new Set<number>();

    for (let attempt = 0; attempt < 30; attempt++) {
      statuses.add((await requestUploadUrl("_avatar", { type: "image/png", size: 512 })).status);
    }

    expect(statuses).toEqual(new Set([200]));
    expect((await requestUploadUrl("_avatar", { type: "image/png", size: 512 })).status).toBe(429);
  });

  it("refuses to set an avatar from a key outside the upload's tmp prefix", async () => {
    const user = await userFactory();

    await expect(
      actingAs(user).api.profile.setAvatar({
        key: "tmp/profile-avatar/../../avatars/someone-else/avatar.png",
      }),
    ).rejects.toHaveValidationErrors("key");
  });

  it("throws when an upload is defined with a size that is not at least 1 byte", async () => {
    const message = (got: string) => `nuxvel: maxSize must be at least 1 byte, as bytes or a size such as "2 MB", got ${got}`;

    expect(await guest().$fetch("/api/_upload-size-check")).toEqual({
      megabytes: 2 * 1024 * 1024,
      unknownUnit: message('"2 megabytes"'),
      zero: message('"0 B"'),
      notANumber: message("NaN"),
      belowOneByte: message("0.5"),
    });
  });
});
