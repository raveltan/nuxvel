export const INVALIDATES_HEADER = "x-nuxvel-invalidates";

export type ClientTag = unknown[];

/**
 * What a mutation invalidates in the client cache besides the tags its
 * response names: `"namespace"` adds its router namespace, `false`
 * adds nothing. Set with `nuxvel.api.invalidateFallback`.
 */
export type InvalidateFallback = "namespace" | false;

export function clientTag(tag: string | readonly unknown[]): ClientTag {
  if (typeof tag !== "string") return [...tag];

  const parts = tag.split(":");
  const glob = parts.findIndex((part) => /[*?[]/.test(part));

  return glob === -1 ? parts : parts.slice(0, glob);
}

export function invalidatesHeaderValue(tags: readonly ClientTag[]) {
  const unique = new Map(tags.map((tag) => [JSON.stringify(tag), tag]));

  return encodeURIComponent(JSON.stringify([...unique.values()]));
}

export function readInvalidatesHeader(headers: Headers): ClientTag[] | undefined {
  const value = headers.get(INVALIDATES_HEADER);

  return value === null ? undefined : JSON.parse(decodeURIComponent(value));
}
