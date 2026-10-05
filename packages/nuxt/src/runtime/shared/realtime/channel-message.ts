/**
 * What a channel's listeners receive for each `broadcast()`, as it
 * travels: the event name and its payload, sent as the JSON `data` of a
 * server-sent event.
 */
export interface BroadcastMessage {
  event: string;
  payload: unknown;
}
