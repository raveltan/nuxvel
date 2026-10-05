import type { fetch } from "@nuxt/test-utils/e2e";
import { onTestFinished } from "vitest";
import type { ChannelEvent, ChannelName } from "../runtime/server/realtime/registry";
import { formatChannelRequests } from "../runtime/shared/realtime/channel-request";

/**
 * The event names {@link ChannelListener.next} accepts for the channel (or room, such as `posts?id=1`) that `listen()` got: the events the channel declares and the `presence.*` events. Any string for a name that is not a {@link ChannelName}.
 */
export type ListenEvent<Channel extends string> = Channel extends `${infer Name}?${string}`
  ? ListenEvent<Name>
  : Channel extends ChannelName
    ? ChannelEvent<Channel> | `presence.${string}`
    : string;

/** What {@link TestClient.listen} resolves with. */
export interface ChannelListener<Event extends string = string> {
  /** The channels the app accepted, in the form they were asked for. */
  channels: string[];
  /** The channels the app refused. */
  refused: string[];
  /**
   * Resolves with the next broadcast of an accepted channel, with its event `id`. Skips `ping`. Rejects after 5 seconds with no event.
   *
   * On a presence room the stream also carries `presence.sync`, `presence.join`, `presence.leave` and `presence.update`, in no fixed order with the broadcasts. Pass `event` to skip every event with another name.
   *
   * @param event The event name to wait for. Without it, `next()` resolves with the next event of any name.
   *
   * @example
   * ```ts
   * const stream = await actingAs(ada).listen("room?roomId=1");
   * await actingAs(ada).trpc.message.post({ roomId: 1, body: "Hi" });
   * expect(await stream.next("posted")).toMatchObject({ payload: { id: expect.any(Number) } });
   * ```
   */
  next(event?: Event): Promise<ChannelMessage>;
  /** Closes the stream. The end of the test closes it too. */
  close(): void;
}

/** One broadcast that {@link ChannelListener.next} resolves with. */
export interface ChannelMessage {
  /** The event ID. Pass it as `lastEventId` to {@link ListenOptions} to catch up from this event. */
  id: string;
  event: string;
  payload: unknown;
}

/** Options of {@link TestClient.listen}. */
export interface ListenOptions {
  /** Sends this event ID as `Last-Event-ID` for each channel, as a browser does on a reconnect. The stream then replays the events after it. */
  lastEventId?: string;
}

export type ListenToChannels = <Channel extends string>(
  channels: Channel | Channel[],
  options?: ListenOptions,
) => Promise<ChannelListener<ListenEvent<Channel>>>;

function parseBlock(block: string) {
  let event = "message";
  let id = "";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    if (line.startsWith("id: ")) id = line.slice(4);
    if (line.startsWith("data: ")) data.push(line.slice(6));
  }

  return { id, event, data: data.join("\n") };
}

async function* readEvents(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffered = "";

  const reader = body.getReader();

  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffered += decoder.decode(chunk.value, { stream: true });

    for (let end = buffered.indexOf("\n\n"); end !== -1; end = buffered.indexOf("\n\n")) {
      yield parseBlock(buffered.slice(0, end));
      buffered = buffered.slice(end + 2);
    }
  }
}

async function refusal(send: typeof fetch, name: string) {
  const probe = new AbortController();
  const response = await send(`/api/channels/${name.split("?")[0]}`, { signal: probe.signal });

  probe.abort();

  return response.status === 404 ? "NOT_FOUND" : "FORBIDDEN";
}

export function listener(send: typeof fetch): ListenToChannels {
  return async <Channel extends string>(channels: Channel | Channel[], options: ListenOptions = {}) => {
    const names = [channels].flat();
    const stream = new AbortController();
    const response = await send(`/api/channels?channels=${formatChannelRequests(names.map((name) => ({ name, ...options })))}`, {
      signal: stream.signal,
    });

    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`The channel stream answered ${response.status}`), { statusCode: response.status });
    }

    const events = readEvents(response.body);
    const close = () => stream.abort();

    onTestFinished(close);

    const connected = await events.next();
    const info: { channels: string[]; refused: string[] } = JSON.parse(connected.value?.data ?? "{}");

    if (info.channels.length === 0) {
      close();
      const code = await refusal(send, info.refused[0] ?? "");

      throw Object.assign(new Error(`The app refused the channels ${info.refused.join(", ")} with ${code}`), { code });
    }

    async function next(event?: string) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("No channel event arrived in 5 seconds")), 5000);
      });

      try {
        for (;;) {
          const message = await Promise.race([events.next(), timeout]);

          if (message.done) throw new Error("The channel stream ended");
          if (!message.value.event.startsWith("channel:")) continue;

          const data: { event: string; payload: unknown } = JSON.parse(message.value.data);
          const broadcast = { id: message.value.id, ...data };

          if (event === undefined || broadcast.event === event) return broadcast;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    return { channels: info.channels, refused: info.refused, next, close };
  };
}
