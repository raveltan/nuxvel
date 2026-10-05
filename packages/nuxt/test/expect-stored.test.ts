import { randomUUID } from "node:crypto";
import { beforeAll, describe, it } from "vitest";
import { expect, expectNotStored, expectStored } from "@nuxvel/nuxt/testing";
import { ensureBucket, putObject } from "./helpers/storage";
import { TEST_STORAGE_BUCKET } from "./setup/constants";
import { setupPlayground } from "./helpers/playground";

describe("expectStored() / expectNotStored()", async () => {
  await setupPlayground();

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("expectStored() returns the content type and size of the object", async () => {
    const key = `expect-stored/${randomUUID()}`;

    await putObject(TEST_STORAGE_BUCKET, key, Buffer.alloc(12), "image/png");

    expect(await expectStored(key)).toEqual({ contentType: "image/png", size: 12 });
  });

  it("expectStored() rejects when the bucket has no object at the key", async () => {
    await expect(expectStored(`expect-stored/${randomUUID()}`)).rejects.toThrow("is not in the bucket");
  });

  it("expectNotStored() passes when the bucket has no object at the key", async () => {
    await expectNotStored(`expect-not-stored/${randomUUID()}`);
  });

  it("expectNotStored() rejects when the bucket holds an object at the key", async () => {
    const key = `expect-not-stored/${randomUUID()}`;

    await putObject(TEST_STORAGE_BUCKET, key, Buffer.alloc(12), "image/png");

    await expect(expectNotStored(key)).rejects.toThrow(`${key} is in the bucket`);
  });
});
