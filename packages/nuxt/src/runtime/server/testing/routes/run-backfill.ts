import { defineEventHandler } from "h3";
import superjson from "superjson";
import { type BackfillName, findBackfill } from "../../backfills/registry";
import { runBackfill } from "../../backfills/run-backfill";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

function isBackfillName(name: string): name is BackfillName {
  return findBackfill(name) !== undefined;
}

async function runBackfillByName(name: string) {
  if (!isBackfillName(name)) throw new Error(`No backfill is named "${name}"`);

  await runBackfill(name);
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name } = await readSuperjsonBody<{ name: string }>(event);

  return superjson.serialize(await settle(() => runBackfillByName(name)));
});
