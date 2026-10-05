import type { H3Event } from "h3";
import { actorContext } from "../actions/context";
import type { Actor } from "../actions/system-actor";
import { currentEvent } from "../utils/current-event";

export interface LogContext {
  requestId?: string;
  actor?: string;
}

function actorLabel(actor: Pick<Actor, "type" | "id">) {
  return `${actor.type}:${actor.id}`;
}

export function rememberActor(event: H3Event, actor: Pick<Actor, "type" | "id">) {
  event.context.nuxvelActor = actorLabel(actor);
}

export function logContext(): LogContext {
  const event = currentEvent();
  const actor = actorContext.getStore();
  const requestId = event?.context.nuxvelRequestId;
  const actorName = actor ? actorLabel(actor) : event?.context.nuxvelActor;

  return {
    ...(requestId === undefined ? {} : { requestId }),
    ...(actorName === undefined ? {} : { actor: actorName }),
  };
}
