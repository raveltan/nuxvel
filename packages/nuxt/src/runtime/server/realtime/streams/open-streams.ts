import type { EventStream } from "h3";

export type ChannelEvent = { id: string; data: string };

type Deliver = (event: ChannelEvent) => void;

const streamsByChannel = new Map<string, Map<EventStream, Deliver>>();

export function holdStream(channel: string, stream: EventStream, deliver: Deliver) {
  const streams = streamsByChannel.get(channel) ?? new Map<EventStream, Deliver>();

  streams.set(stream, deliver);
  streamsByChannel.set(channel, streams);
}

export function releaseStream(channel: string, stream: EventStream) {
  const streams = streamsByChannel.get(channel);

  streams?.delete(stream);
  if (streams?.size === 0) streamsByChannel.delete(channel);
}

export function deliverToStreams(channel: string, event: ChannelEvent) {
  for (const deliver of streamsByChannel.get(channel)?.values() ?? []) deliver(event);
}

export function closeOpenStreams() {
  for (const streams of streamsByChannel.values()) {
    for (const stream of streams.keys()) void stream.close();
  }
}

export function countOpenStreams(channel: string) {
  return streamsByChannel.get(channel)?.size ?? 0;
}
