import { onCommit } from "../database/transaction";
import { ValidationFailedError } from "../errors/taxonomy";
import { publishObserved } from "../observe/channels";
import { type PresenceParams, presenceRoom } from "../../shared/realtime/presence-room";
import { type ListenableChannel, findChannel } from "./registry";
import { publishChannelMessage } from "./streams/publish-message";

export async function broadcastOnCommit(nameOrChannel: string | ListenableChannel, event: string, payload: unknown, params?: PresenceParams) {
  const message = await validatedMessage(nameOrChannel, event, payload, params);

  await onCommit(() => publish(message));
}

async function validatedMessage(nameOrChannel: string | ListenableChannel, event: string, payload: unknown, params?: PresenceParams) {
  const channel = typeof nameOrChannel === "string" ? nameOrChannel : nameOrChannel.name;
  const key = params === undefined ? channel : presenceRoom(channel, params);
  const schema = findChannel(key)?.events[event];

  if (!schema) throw new Error(`Channel "${key}" has no event "${event}"`);

  const parsed = await schema.safeParseAsync(payload);

  if (!parsed.success) throw new ValidationFailedError(parsed.error);

  return { channel, key, event, payload: parsed.data, params };
}

async function publish({ channel, key, event, payload, params }: Awaited<ReturnType<typeof validatedMessage>>) {
  await publishChannelMessage(key, event, payload);
  publishObserved("realtime:broadcast", { channel, event, payload, params });
}
