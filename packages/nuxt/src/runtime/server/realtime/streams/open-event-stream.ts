import { createEventStream, type EventStream, type H3Event } from "h3";
import { ipKey } from "../../security/rate-limit-key";
import type { auth } from "../../utils/auth";
import { useNuxvelConfig } from "../../utils/config";
import { DEFAULT_MAX_CONNECTIONS } from "../max-connections";
import { closeWhenSessionRevoked } from "./channel-subscriber";
import { claimConnectionSlot } from "./connection-cap";
import { keepAlive } from "./keep-alive";

export async function openEventStream(
  event: H3Event,
  session: Awaited<ReturnType<typeof auth>>,
  onPing?: () => void,
): Promise<EventStream> {
  const owner = session ? `user:${session.user.id}` : ipKey(event);
  const release = claimConnectionSlot(owner, useNuxvelConfig().realtime?.maxConnections ?? DEFAULT_MAX_CONNECTIONS);
  const stream = createEventStream(event);

  stream.onClosed(release);

  if (session) {
    stream.onClosed(await closeWhenSessionRevoked(session.session.id, () => void stream.close()));
  }

  keepAlive(stream, onPing);

  return stream;
}
