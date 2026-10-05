import type { H3Event } from "h3";
import type { ChannelRequest } from "../../../shared/realtime/channel-request";
import type { auth } from "../../utils/auth";
import { replayableEventId } from "./catch-up";
import { holdConnection,
  reauthorizeConnection,
  refreshConnectionPresence,
  startJoiningChannel,
} from "./connections";
import { openEventStream } from "./open-event-stream";

interface OpenConnectionOptions {
  channels: readonly ChannelRequest[];
  multiplexed: boolean;
  session: Awaited<ReturnType<typeof auth>>;
  connected: (connectionId: string) => unknown;
}

export async function openConnection(event: H3Event, options: OpenConnectionOptions) {
  let connectionId: string | undefined;
  const stream = await openEventStream(event, options.session, () => {
    if (connectionId === undefined) return;

    void refreshConnectionPresence(connectionId);
    void reauthorizeConnection(connectionId, event.headers);
  });

  connectionId = await holdConnection(stream, {
    multiplexed: options.multiplexed,
    user: options.session?.user ?? null,
  });

  const catchUps = [];

  for (const request of options.channels) {
    catchUps.push(
      await startJoiningChannel(connectionId, request.name, replayableEventId(request.lastEventId)),
    );
  }

  void stream.push({ event: "connected", data: JSON.stringify(options.connected(connectionId)) });
  for (const catchUp of catchUps) await catchUp();

  return stream.send();
}
