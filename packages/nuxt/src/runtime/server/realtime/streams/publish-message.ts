import { stringifyBroadcast } from "../../../shared/realtime/channel-message";
import { publishToChannel } from "./replay-buffer";

export async function publishChannelMessage(channel: string, event: string, payload: unknown) {
  await publishToChannel(channel, stringifyBroadcast({ event, payload }));
}
