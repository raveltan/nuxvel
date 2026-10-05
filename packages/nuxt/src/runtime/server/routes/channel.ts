import { defineEventHandler, getRequestHeader, getRouterParam } from "h3";
import { ForbiddenError } from "../errors/forbidden-error";
import { NotFoundError } from "../errors/taxonomy";
import { findChannel } from "../realtime/registry";
import { openConnection } from "../realtime/streams/open-connection";
import { auth } from "../utils/auth";

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name") ?? "";
  const channel = findChannel(name);

  if (!channel) throw new NotFoundError(`No channel is named "${name}"`);

  const session = await auth();

  if (!(await channel.authorize({ user: session?.user ?? null, params: {} }))) {
    throw new ForbiddenError(`Not allowed to listen to channel "${name}"`);
  }

  const lastEventId = getRequestHeader(event, "last-event-id");

  return openConnection(event, {
    channels: [lastEventId === undefined ? { name: channel.name } : { name: channel.name, lastEventId }],
    multiplexed: false,
    session,
    connected: () => ({}),
  });
});
