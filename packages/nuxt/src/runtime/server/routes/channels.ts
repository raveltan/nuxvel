import { createEventStream, defineEventHandler, getQuery, type H3Event } from "h3";
import { useRuntimeConfig } from "nitropack/runtime";
import {
  parseChannelRequests,
  type ChannelRequest,
} from "../../shared/realtime/channel-request";
import { presenceRoomParams } from "../../shared/realtime/presence-room";
import { MAX_CHANNELS } from "../realtime/max-connections";
import { findChannel } from "../realtime/registry";
import { openConnection } from "../realtime/streams/open-connection";
import { ipKey } from "../security/rate-limit-key";
import { CHANNEL_JOIN_RATE_LIMIT } from "../security/rate-limit-registry";
import { rateLimiter } from "../security/rate-limit";
import { auth } from "../utils/auth";

function reload(event: H3Event) {
  const stream = createEventStream(event);

  void stream.push({ event: "reload", data: "" }).then(() => stream.close());

  return stream.send();
}

export default defineEventHandler(async (event) => {
  const { channels: requested, build } = getQuery(event);

  if (typeof build === "string" && build !== useRuntimeConfig().app.buildId) return reload(event);

  const session = await auth();
  const user = session?.user ?? null;
  const requests = parseChannelRequests(typeof requested === "string" ? requested : "");
  const limiter = rateLimiter(CHANNEL_JOIN_RATE_LIMIT);
  const owner = session ? `user:${session.user.id}` : ipKey(event);
  const allowed: ChannelRequest[] = [];
  const refused: string[] = [];

  for (const request of requests.slice(0, MAX_CHANNELS)) {
    await limiter.consume(owner);

    const channel = findChannel(request.name);

    if (channel && (await channel.authorize({ user, params: presenceRoomParams(request.name) }))) allowed.push(request);
    else refused.push(request.name);
  }

  refused.push(...requests.slice(MAX_CHANNELS).map((request) => request.name));

  return openConnection(event, {
    channels: allowed,
    multiplexed: true,
    session,
    connected: (connectionId) => ({
      connectionId,
      channels: allowed.map((request) => request.name),
      refused,
    }),
  });
});
