import { defineEventHandler } from "h3";
import superjson from "superjson";
import { type PresenceParams, presenceRoom } from "../../../shared/realtime/presence-room";
import { presenceMembers } from "../../realtime/presence";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { channel, params } = await readSuperjsonBody<{ channel: string; params: PresenceParams }>(event);

  return superjson.serialize(await settle(() => presenceMembers(presenceRoom(channel, params))));
});
