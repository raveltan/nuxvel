import type {
  EmittedEvent,
  ListenerRun,
  ObservedActionCall,
  ObservedBroadcast,
  ObservedCacheLookup,
  ObservedError,
  ObservedLog,
  ObservedPolicyDecision,
  SentMail,
  SentNotification,
} from "../observe/channels";
import type { FetchedRequest } from "./fetch-fake";

export interface RecordedJob {
  name: string;
  payload: unknown;
}

/** One web push the `nuxvel.push` job handed to the fake push service: where to, and the notification it carried. */
export interface DeliveredPush {
  endpoint: string;
  notification: Record<string, unknown>;
}

export interface RecordedEffects {
  dispatched: RecordedJob[];
  emitted: EmittedEvent[];
  fetched: FetchedRequest[];
  listenerRuns: ListenerRun[];
  queued: RecordedJob[];
  sent: SentMail[];
  notified: SentNotification[];
  pushes: DeliveredPush[];
  goneEndpoints: string[];
  policyDecisions: ObservedPolicyDecision[];
  actionCalls: ObservedActionCall[];
  broadcasts: ObservedBroadcast[];
  cacheLookups: ObservedCacheLookup[];
  errors: ObservedError[];
  logs: ObservedLog[];
}

const recorded: RecordedEffects = {
  dispatched: [],
  emitted: [],
  fetched: [],
  listenerRuns: [],
  queued: [],
  sent: [],
  notified: [],
  pushes: [],
  goneEndpoints: [],
  policyDecisions: [],
  actionCalls: [],
  broadcasts: [],
  cacheLookups: [],
  errors: [],
  logs: [],
};

export function recordedEffects(): RecordedEffects {
  return recorded;
}

export function resetRecordedEffects() {
  for (const records of Object.values(recorded)) records.length = 0;
}
