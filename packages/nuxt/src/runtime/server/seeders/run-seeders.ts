import { configureFactories } from "@nuxvel/nuxt/factories";
import { actorContext } from "../actions/context";
import { cacheForget } from "../cache/cache";
import { systemActor } from "../actions/system-actor";
import { useDb } from "../database/client";
import { transaction } from "../database/transaction";
import { seederDefinitions } from "./registry";

export async function runSeeders(names: readonly string[], onSeeded: (name: string) => void = () => {}): Promise<string[]> {
  configureFactories({ db: useDb });

  const seeders = new Map(seederDefinitions().map((seeder) => [seeder.name, seeder]));
  const started = new Set<string>();
  const finished: string[] = [];

  async function run(name: string) {
    if (finished.includes(name)) return;
    if (started.has(name)) throw new Error(`The seeder "${name}" calls itself through call()`);

    const seeder = seeders.get(name);

    if (!seeder) throw new Error(`No seeder named "${name}"`);

    started.add(name);
    await transaction(() =>
      seeder.handler({
        call: async (...called) => {
          for (const seeder of called) await run(typeof seeder === "string" ? seeder : seeder.name);
        },
      }),
    );
    finished.push(name);
  }

  try {
    await actorContext.run(systemActor("seed"), async () => {
      for (const name of names.length > 0 ? names : [...seeders.keys()]) {
        const committed = finished.length;

        await run(name);
        finished.slice(committed).forEach(onSeeded);
      }
    });
  } finally {
    if (finished.length > 0) await cacheForget("*");
  }

  return finished;
}
