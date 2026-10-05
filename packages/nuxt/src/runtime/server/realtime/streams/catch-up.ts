import type { EventStream } from "h3";
import type { ChannelEvent } from "./open-streams";

const EVENT_ID_PATTERN = /^\d+-\d+$/;
const LARGEST_ID_PART = BigInt("0xffffffffffffffff");

function parseEventId(id: string) {
  if (!EVENT_ID_PATTERN.test(id)) return undefined;

  const [time = BigInt(0), sequence = BigInt(0)] = id.split("-").map(BigInt);

  const inRange = time <= LARGEST_ID_PART && sequence <= LARGEST_ID_PART;
  const hasSuccessor = time < LARGEST_ID_PART || sequence < LARGEST_ID_PART;

  return inRange && hasSuccessor ? { time, sequence } : undefined;
}

export function isAfter(id: string, previous: string) {
  const event = parseEventId(id);
  const before = parseEventId(previous);

  if (!event || !before) return true;

  return (
    event.time > before.time ||
    (event.time === before.time && event.sequence > before.sequence)
  );
}

export function replayableEventId(header: string | undefined) {
  return header !== undefined && parseEventId(header) ? header : undefined;
}

export function catchUpDelivery(
  stream: EventStream,
  lastEventId: string | undefined,
  eventName?: string,
) {
  let lastSent = lastEventId;
  let pending: ChannelEvent[] | undefined = [];

  function send(event: ChannelEvent) {
    if (lastSent !== undefined && !isAfter(event.id, lastSent)) return;

    lastSent = event.id;
    void stream.push(
      eventName === undefined
        ? { id: event.id, data: event.data }
        : { id: event.id, event: eventName, data: event.data },
    );
  }

  return {
    deliver(event: ChannelEvent) {
      if (pending) pending.push(event);
      else send(event);
    },
    catchUp(backlog: ChannelEvent[]) {
      const buffered = pending ?? [];

      pending = undefined;
      for (const event of [...backlog, ...buffered]) send(event);
    },
  };
}
