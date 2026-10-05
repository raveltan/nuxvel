import { defineEventHandler } from "h3";
import superjson from "superjson";
import { systemActor } from "../../actions/system-actor";
import { userActor } from "../../actions/user-actor";
import { findAction } from "../action-registry";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { sessionUser } from "../session-user";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

interface RunActionRequest {
  name: string;
  input: unknown;
  userId?: string;
  systemName?: string;
}

async function actorFor({ userId, systemName }: RunActionRequest) {
  if (systemName !== undefined) return systemActor(systemName);

  return userActor(await sessionUser(userId ?? ""));
}

async function runAction(request: RunActionRequest) {
  const { name, input } = request;
  const action = findAction(name);

  if (!action) throw new Error(`No action is named "${name}"`);

  return action(input, { actor: await actorFor(request) });
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const request = await readSuperjsonBody<RunActionRequest>(event);

  return superjson.serialize(await settle(() => runAction(request)));
});
