import * as $backfills from "#nuxvel/backfills-namespace";

import type probeNames from "~~/server/database/backfills/_probe-names";

type IsAny<T> = 0 extends 1 & T ? true : false;

type BackfillRow = Parameters<(typeof probeNames)["handler"]>[0][number];

export const backfillRowIsTyped: IsAny<BackfillRow> extends true
  ? never
  : BackfillRow["name"] extends string
    ? BackfillRow["id"] extends number
      ? true
      : never
    : never = true;

export const backfillNameIsTyped: IsAny<BackfillName> extends true
  ? never
  : string extends BackfillName
    ? never
    : "_probe-names" extends BackfillName
      ? true
      : never = true;

export async function runsOnlyDefinedBackfills() {
  await runBackfill("_probe-names");

  // @ts-expect-error no backfill is named probe-missing
  await runBackfill("probe-missing");
}

export async function runsABackfillByItsDefinition() {
  await runBackfill($backfills._probeNames);

  // @ts-expect-error a rate limit is not a backfill
  await runBackfill($rateLimits.login);
}

type NamespacedBackfill = typeof $backfills._probeNames;

export const backfillsNamespaceIsTyped: IsAny<NamespacedBackfill> extends true
  ? never
  : NamespacedBackfill extends Backfill
    ? true
    : never = true;
