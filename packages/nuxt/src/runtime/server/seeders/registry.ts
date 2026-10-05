import seeders from "#nuxvel/seeders";
import type { Seeder } from "./define-seeder";

/**
 * The name of every seeder defined under `server/seeders/`: what
 * `call()` in a {@link defineSeeder} handler takes.
 */
export type SeederName = (typeof seeders)[number]["name"];

export function seederDefinitions(): readonly Seeder[] {
  return seeders;
}
