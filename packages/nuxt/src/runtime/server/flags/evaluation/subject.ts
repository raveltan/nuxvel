import { getCookie } from "h3";
import { actorContext } from "../../actions/context";
import { auth } from "../../utils/auth";
import { useNuxvelConfig } from "../../utils/config";
import { currentEvent } from "../../utils/current-event";
import type { FlagSubject } from "../flag";

export async function resolveSubject(
  subject: FlagSubject | undefined,
): Promise<FlagSubject | undefined> {
  if (subject) return subject;

  const actor = actorContext.getStore();

  if (actor?.type === "user") return { id: actor.id, role: actor.role };
  if (!currentEvent()) return undefined;

  const session = await auth();

  if (!session) return undefined;

  return { id: session.user.id, role: session.user.role };
}

const CONSENT_COOKIE = "nuxvel-consent";

function withoutConsent() {
  if (!useNuxvelConfig().experiments?.requireConsent) return false;

  const event = currentEvent();

  return event ? getCookie(event, CONSENT_COOKIE) !== "granted" : false;
}

export function experimentSubject(subject: FlagSubject | undefined): FlagSubject | undefined {
  return withoutConsent() ? undefined : subject;
}
