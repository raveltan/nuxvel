import { useLogger } from "../logging/logger";
import { publishObserved } from "../observe/channels";
import type { Actor } from "./system-actor";

function outcome(entry: { ok: boolean; error?: string }) {
  return entry.ok ? "ok" : `failed: ${entry.error ?? "unknown error"}`;
}

/**
 * Writes one `action` log line for an action call: its name, outcome,
 * duration and actor (`"type:id"`), plus the request id through the
 * logger. {@link defineAction} calls this for you.
 */
export function logActionCall(entry: {
  action: string;
  actor: Actor;
  durationMs: number;
  ok: boolean;
  error?: string;
}) {
  publishObserved("action:call", entry);
  useLogger("action").info(`${entry.action} ${outcome(entry)} (${Math.round(entry.durationMs)}ms)`, {
    ...entry,
    actor: `${entry.actor.type}:${entry.actor.id}`,
  });
}
