import { randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { ensureBucket, putObject, storedObjectSize } from "./helpers/storage";
import { TEST_STORAGE_BUCKET } from "./setup/constants";
import { setupPlayground } from "./helpers/playground";

const PNG = Buffer.concat([
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  Buffer.alloc(186),
]);

async function run(scenario: string) {
  const key = `tmp/profile-avatar/${randomUUID()}`;
  const to = `stored-files/${randomUUID()}`;

  await putObject(TEST_STORAGE_BUCKET, key, PNG, "image/png");
  await guest().$fetch("/api/_stored-files-check", { method: "POST", body: { scenario, key, to } });

  return {
    key: await storedObjectSize(TEST_STORAGE_BUCKET, key),
    to: await storedObjectSize(TEST_STORAGE_BUCKET, to),
  };
}

describe("stored files and transactions", async () => {
  await setupPlayground();

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("deletes a promoted file when the transaction rolls back", async () => {
    expect(await run("promote-rollback")).toEqual({ key: undefined, to: undefined });
  });

  it("deletes a promoted file when only its savepoint rolls back", async () => {
    expect(await run("promote-savepoint-rollback")).toEqual({ key: undefined, to: undefined });
  });

  it("deletes a file promoted in a committed savepoint when the outer transaction rolls back", async () => {
    expect(await run("promote-outer-rollback")).toEqual({ key: undefined, to: undefined });
  });

  it("deleteStoredFiles() deletes the files after the commit", async () => {
    expect(await run("delete-commit")).toEqual({ key: undefined, to: undefined });
  });

  it("deleteStoredFiles() keeps the files when the transaction rolls back", async () => {
    expect(await run("delete-rollback")).toEqual({ key: PNG.byteLength, to: undefined });
  });
});
