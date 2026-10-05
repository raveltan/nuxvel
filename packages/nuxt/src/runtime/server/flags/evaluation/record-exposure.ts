import type { H3Event } from "h3";
import { useDb } from "../../database/client";
import { schemaTable } from "../../database/schema-table";
import type { FlagSubject } from "../flag";
import { currentEvent } from "../../utils/current-event";

const recordedByRequest = new WeakMap<H3Event, Set<string>>();

function firstTimeThisRequest(exposure: string) {
  const event = currentEvent();

  if (!event) return true;

  const recorded = recordedByRequest.get(event) ?? new Set<string>();

  recordedByRequest.set(event, recorded);

  if (recorded.has(exposure)) return false;

  recorded.add(exposure);

  return true;
}

export async function recordExposure(
  name: string,
  subject: FlagSubject | undefined,
  variant: string,
) {
  if (!subject || !firstTimeThisRequest(JSON.stringify([name, subject.id, variant]))) return;

  await useDb({ root: true })
    .insert(schemaTable("flag_exposures"))
    .values({ name, unitId: subject.id, variant })
    .onConflictDoNothing();
}
