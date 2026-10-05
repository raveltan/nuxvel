/** What tells one presence room of a channel from another, such as `{ id: 42 }`. */
export type PresenceParams = Record<string, string | number>;

/**
 * The key a presence room travels under as a channel: the channel name,
 * `?`, then its params as a sorted query string, so `posts` with
 * `{ id: 42 }` is `posts?id=42`.
 */
export function presenceRoom(channel: string, params: PresenceParams = {}) {
  const query = new URLSearchParams(
    Object.entries(params)
      .map(([key, value]) => [key, String(value)])
      .sort(([a = ""], [b = ""]) => a.localeCompare(b)),
  );

  return `${channel}?${query.toString()}`;
}

/** The channel a {@link presenceRoom} key belongs to, or `undefined` for a plain channel name. */
export function presenceRoomChannel(key: string) {
  const separator = key.indexOf("?");

  return separator < 0 ? undefined : key.slice(0, separator);
}

/** The params of a {@link presenceRoom} key, as strings, such as `{ id: "42" }` for `posts?id=42`, or `{}` for a plain channel name. */
export function presenceRoomParams(key: string): Record<string, string> {
  const separator = key.indexOf("?");

  return separator < 0 ? {} : Object.fromEntries(new URLSearchParams(key.slice(separator + 1)));
}
