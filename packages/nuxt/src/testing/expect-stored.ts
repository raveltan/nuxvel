import { expect } from "vitest";
import { z } from "zod";
import { callApp } from "./settled";

const storedObject = z.object({ contentType: z.string().optional(), size: z.number() });

/** The content type and size of an object in the bucket of the app. */
export type StoredObject = z.infer<typeof storedObject>;

/**
 * Asserts that the bucket of the app holds an object at `key`, and returns its content type and size.
 *
 * It reads through {@link useS3} and {@link useBucket} in the app under test.
 * The test needs `NUXT_STORAGE_URL`, `NUXT_STORAGE_BUCKET` and a bucket made with `nuxvel storage:setup`.
 * Tests do not remove objects, so use a key that only this test uses.
 * See {@link promoteUpload} and {@link deleteStoredFiles}.
 *
 * @example
 * ```ts
 * await runAction("posts.set-cover", { postId: post.id, key: upload.key }, { actingAs: author });
 * const cover = await expectStored(`covers/${post.id}`);
 * expect(cover.contentType).toBe("image/png");
 * ```
 */
export async function expectStored(key: string): Promise<StoredObject> {
  const object = storedObject.nullable().parse(await callApp("stored", { key }));

  expect(object, `${key} is not in the bucket`).not.toBeNull();

  return storedObject.parse(object);
}

/**
 * Asserts that the bucket of the app holds no object at `key`, for
 * example after a delete or a refused upload. It reads the bucket like
 * {@link expectStored}, with the same storage settings.
 *
 * @example
 * ```ts
 * await runAction("posts.remove-cover", { postId: post.id }, { actingAs: author });
 * await expectNotStored(`covers/${post.id}`);
 * ```
 */
export async function expectNotStored(key: string): Promise<void> {
  const object = storedObject.nullable().parse(await callApp("stored", { key }));

  expect(object, `${key} is in the bucket`).toBeNull();
}
