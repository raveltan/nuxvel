import superjson from "superjson";

/**
 * What a channel's listeners receive for each `broadcast()`, as it
 * travels: the event name and its payload, sent as the superjson `data`
 * of a server-sent event.
 */
export interface BroadcastMessage {
  event: string;
  payload: unknown;
}

export function stringifyBroadcast(message: BroadcastMessage) {
  return superjson.stringify(message);
}

export function parseBroadcast(data: string): BroadcastMessage {
  const parsed = JSON.parse(data);

  // a server from before 0.3.0 sent plain { event, payload }, which has no top-level json key, as superjson output always has
  return "json" in parsed ? superjson.deserialize(parsed) : parsed;
}
