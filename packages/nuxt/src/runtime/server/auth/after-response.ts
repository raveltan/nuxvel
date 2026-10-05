import { currentEvent } from "../utils/current-event";
import { logAuth } from "./log";

const pending = new Set<Promise<void>>();

export function runAfterResponse(promise: Promise<unknown>) {
  const settled: Promise<void> = promise
    .then(
      () => {},
      (error: unknown) => logAuth("error", "Failed to run background task:", error),
    )
    .finally(() => pending.delete(settled));
  pending.add(settled);
  currentEvent()?.waitUntil(settled);
}

export async function settleAfterResponse() {
  await Promise.allSettled(pending);
}
