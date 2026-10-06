import { AsyncLocalStorage } from "node:async_hooks";
import type { H3Event } from "h3";
import { type ClientTag, clientTag } from "../../shared/trpc/invalidates-header";
import type { CacheKey } from "../cache/cache";

const scope = new AsyncLocalStorage<{ tags?: ClientTag[] }>();
const invalidatedByRequest = new WeakMap<H3Event, ClientTag[]>();

export function reportInvalidated(tags: readonly CacheKey[]) {
  const collected = scope.getStore();

  if (collected) collected.tags = [...(collected.tags ?? []), ...tags.map(clientTag)];
}

export async function collectInvalidated<T extends { ok: boolean }>(event: H3Event | undefined, fn: () => Promise<T>) {
  const collected: { tags?: ClientTag[] } = {};
  const result = await scope.run(collected, fn);

  if (event && result.ok && collected.tags) {
    invalidatedByRequest.set(event, [...(invalidatedByRequest.get(event) ?? []), ...collected.tags]);
  }

  return result;
}

export function invalidatedBy(event: H3Event | undefined) {
  return event && invalidatedByRequest.get(event);
}
