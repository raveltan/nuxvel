import { findListener } from "../events/registry";
import { toJobPayload } from "../jobs/payload";

export async function runListener(name: string, payload: unknown) {
  const listener = findListener(name);

  if (!listener) throw new Error(`No listener is named "${name}"`);

  await listener.runQueued(toJobPayload(listener.version, payload));
}
