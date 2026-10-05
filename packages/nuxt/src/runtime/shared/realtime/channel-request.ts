/** The longest channel name, room key included, that the channel endpoints accept. */
export const MAX_CHANNEL_NAME_LENGTH = 256;

/** A channel a connection wants to listen to, and where it left off. */
export interface ChannelRequest {
  name: string;
  lastEventId?: string;
}

/**
 * The server-sent event name a multiplexed connection delivers this
 * channel's broadcasts under.
 */
export function channelEventName(channel: string) {
  return `channel:${channel}`;
}

/**
 * Encodes the channels a multiplexed connection opens with as the
 * `channels` query parameter `GET /api/channels` reads.
 */
export function formatChannelRequests(requests: readonly ChannelRequest[]) {
  return encodeURIComponent(JSON.stringify(requests));
}

/** Reads back what {@link formatChannelRequests} wrote, dropping what it cannot read and any name over {@link MAX_CHANNEL_NAME_LENGTH} characters. */
export function parseChannelRequests(channels: string): ChannelRequest[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(channels);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];

    const { name, lastEventId } = entry as {
      name?: unknown;
      lastEventId?: unknown;
    };

    if (typeof name !== "string" || name.length > MAX_CHANNEL_NAME_LENGTH) return [];

    return [typeof lastEventId === "string" ? { name, lastEventId } : { name }];
  });
}
