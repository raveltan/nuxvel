import { defineEventHandler } from "h3";
import superjson from "superjson";
import events from "#nuxvel/events";
import { transaction } from "../../database/transaction";
import type { DomainEvent } from "../../events/define-event";
import { emit } from "../../events/emit";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

async function emitByName(name: string, payload: unknown) {
  const discovered: readonly DomainEvent[] = events;
  const found = discovered.find((event) => event.name === name);

  if (!found) throw new Error(`No event is named "${name}"`);

  await transaction(() => emit(found, payload));
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, payload } = await readSuperjsonBody<{ name: string; payload: unknown }>(event);

  return superjson.serialize(await settle(() => emitByName(name, payload)));
});
