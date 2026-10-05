import { hasSubscribers } from "node:diagnostics_channel";
import { type ObservedName, RUN_CHANNEL } from "../../../../../src/runtime/server/observe/channels";

const OBSERVED: Record<ObservedName, true> = {
  "db:query": true,
  "trpc:call": true,
  "action:call": true,
  "policy:decision": true,
  "flag:evaluation": true,
  "job:dispatch": true,
  "event:emit": true,
  "listener:run": true,
  "mail:send": true,
  "notification:send": true,
  "realtime:broadcast": true,
  "rate-limit:hit": true,
  "cache:lookup": true,
  log: true,
  error: true,
};

export default defineEventHandler(() => ({
  ...Object.fromEntries(Object.keys(OBSERVED).map((name) => [name, hasSubscribers(`nuxvel:${name}`)])),
  run: hasSubscribers(`tracing:${RUN_CHANNEL}:start`),
}));
