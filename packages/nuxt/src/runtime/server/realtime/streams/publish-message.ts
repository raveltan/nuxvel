import type { BroadcastMessage } from "../../../shared/realtime/channel-message";
import { publishToChannel } from "./replay-buffer";

export async function publishChannelMessage(channel: string, event: string, payload: unknown) {
  const message: BroadcastMessage = { event, payload };

  await publishToChannel(channel, JSON.stringify(message));
}
