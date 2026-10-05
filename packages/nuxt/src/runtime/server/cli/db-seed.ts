import { seederDefinitions } from "../seeders/registry";
import { runSeeders } from "../seeders/run-seeders";
import { CommandError, commandSuccess } from "./command-error";

const SEEDER_HINT = "A seeder is a file under server/seeders, e.g. server/seeders/database.seeder.ts";

export async function runDbSeed(names: string[]): Promise<number> {
  const defined = seederDefinitions().map((seeder) => seeder.name);
  const unknown = names.find((name) => !defined.includes(name));

  if (unknown !== undefined) throw new CommandError(`no seeder named "${unknown}"`, { hint: SEEDER_HINT });

  if (defined.length === 0) {
    commandSuccess("Nothing to seed: server/seeders has no seeders");
    return 0;
  }

  await runSeeders(names, (name) => commandSuccess(`Seeded ${name}`));

  return 0;
}
