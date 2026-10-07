import backfills from "#nuxvel/backfills";
import { definitionsIn, storedName } from "../discovery/aliases";
import type { Renamed } from "../discovery/renamed";
import type { Backfill } from "./define-backfill";

function entries(): readonly (Backfill | Renamed<Backfill>)[] {
  return backfills;
}

/**
 * The discovered backfill with this name, or `undefined` when no file
 * under `server/database/backfills/` defines one.
 *
 * {@link runBackfill} uses it.
 */
export function findBackfill(name: string): Backfill | undefined {
  return definitionsIn(entries()).find((backfill) => backfill.name === name);
}

/**
 * The name a backfill's cursor row is stored under: the old name a
 * {@link renamed} alias keeps for it, or its own.
 */
export function backfillStoredName(backfill: Backfill): string {
  return storedName(entries(), backfill);
}
