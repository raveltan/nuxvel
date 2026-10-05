import { expect, trpcSpy, visit } from "@nuxvel/nuxt/testing";
import { vi } from "vitest";

type IsAny<T> = 0 extends 1 & T ? true : false;

export async function trpcSpyIsTypedByTheRouter() {
  const page = await visit("/_post-search");
  const list = trpcSpy(page, "post.list");
  const inputIsTyped: IsAny<Parameters<typeof list>[0]> extends true ? never : true = true;

  await expect(list).toHaveBeenCalledWith({ q: "hello" });
  await expect(list).not.toHaveBeenLastCalledWith({ q: "other", page: 2 });
  await expect(list).toHaveBeenCalledTimes(1, { timeout: 1000 });
  const plainSpyStaysSync: void = expect(vi.fn()).toHaveBeenCalled();

  // @ts-expect-error no procedure is at post.missing
  trpcSpy(page, "post.missing");
  // @ts-expect-error q of post.list is a string
  await expect(list).toHaveBeenCalledWith({ q: 1 });

  return { inputIsTyped, plainSpyStaysSync };
}
