import * as Sentry from "@sentry/node";
import { migrationHint } from "../database/migration-hint";
import { serializedError } from "../logging/log-record";
import { publishObserved } from "../observe/channels";
import { loggedPath } from "../observe/logged-path";
import { dsnOrigin } from "./csp";

function trackedRequest({ method, url }: Sentry.RequestEventData): Sentry.RequestEventData {
  const tracked: Sentry.RequestEventData = {};

  if (method !== undefined) tracked.method = method;

  if (url !== undefined && URL.canParse(url)) {
    const { origin, pathname } = new URL(url);

    tracked.url = `${origin}${loggedPath(pathname)}`;
  }

  return tracked;
}

export function initErrorTracking(dsn: string | undefined) {
  if (!dsn || Sentry.isInitialized()) return;

  dsnOrigin(dsn);

  Sentry.init({ dsn, sendDefaultPii: false,
    beforeSend: (event) => (event.request ? { ...event, request: trackedRequest(event.request) } : event),
  });
}

function observedError(error: unknown) {
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };

  const hint = migrationHint(error);

  return { ...serializedError(error), ...(hint === undefined ? {} : { hint }) };
}

export function reportError(
  error: unknown,
  tags: Record<string, string | undefined>,
) {
  publishObserved("error", { ...observedError(error), ...(tags.requestId === undefined ? {} : { requestId: tags.requestId }) });

  if (!Sentry.isInitialized()) return;

  Sentry.captureException(error, { tags });
}

export async function flushErrorTracking(timeoutMs: number) {
  if (!Sentry.isInitialized()) return;

  await Sentry.flush(timeoutMs);
}
