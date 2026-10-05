import type { ObservedError, ObservedProcedureCall } from "../observe/channels";
import type { CollectedSpanInput } from "../observe/collector/collected-entry";

function outcome(call: { ok: boolean; error?: string; durationMs: number }) {
  const took = `${call.durationMs.toFixed(1)} ms`;

  return call.ok ? `ok in ${took}` : `failed in ${took}: ${call.error ?? "unknown error"}`;
}

function procedureOutcome(call: ObservedProcedureCall) {
  if (call.ok || call.message === undefined) return outcome(call);

  const fields = Object.entries(call.fields ?? {}).map(([field, messages]) => `${field}: ${messages.join(", ")}`);

  return `${outcome(call)}: ${call.message}${fields.length > 0 ? ` (${fields.join("; ")})` : ""}`;
}

function errorSummary(error: ObservedError) {
  let innermost: ObservedError["cause"] = error.cause;

  while (typeof innermost === "object" && innermost.cause !== undefined) innermost = innermost.cause;

  const summary = `${error.name}: ${error.message}`;

  if (innermost === undefined) return summary;

  return `${summary}, caused by ${typeof innermost === "string" ? innermost : `${innermost.name}: ${innermost.message}`}`;
}

export function spanSummary(span: CollectedSpanInput): string {
  switch (span.type) {
    case "db:query":
      return span.data.sql;
    case "trpc:call":
      return `${span.data.path} (${span.data.type}) ${procedureOutcome(span.data)}`;
    case "action:call":
      return `${span.data.action} by ${span.data.actor.type}:${span.data.actor.id} ${outcome(span.data)}`;
    case "policy:decision":
      return `${span.data.action} on ${span.data.table} for ${span.data.actor}: ${span.data.allowed ? "allowed" : "denied"}`;
    case "flag:evaluation":
      return `${span.data.kind} ${span.data.name} = ${String(span.data.value)}`;
    case "job:dispatch":
    case "event:emit":
    case "mail:send":
      return span.data.name;
    case "notification:send":
      return `${span.data.name} to ${span.data.userId}`;
    case "listener:run":
      return `${span.data.name} on ${span.data.event}`;
    case "realtime:broadcast":
      return `${span.data.event} on ${span.data.channel}`;
    case "rate-limit:hit":
      return `${span.data.key} ${span.data.allowed ? "allowed" : "refused"}`;
    case "cache:lookup":
      return `${span.data.key} ${span.data.hit ? "hit" : "miss"}`;
    case "log":
      return `[${span.data.level}] ${span.data.message}`;
    case "error":
      return errorSummary(span.data);
  }
}
