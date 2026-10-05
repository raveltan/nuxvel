import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export const REHEARSALS_FILE = ".nuxvel/rehearsals.json";

const rehearsalsSchema = z.record(
  z.string(),
  z.object({
    time: z.string(),
    on: z.string(),
    backup: z.string(),
    minutes: z.number(),
    steps: z.array(z.object({ what: z.string(), seconds: z.number() })),
  }),
);

type RecordedRehearsal = z.output<typeof rehearsalsSchema>[string];

export function readRehearsals(cwd: string) {
  const file = join(cwd, REHEARSALS_FILE);

  return existsSync(file) ? rehearsalsSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : {};
}

export function recordRehearsal(cwd: string, source: string, rehearsal: RecordedRehearsal) {
  const file = join(cwd, REHEARSALS_FILE);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...readRehearsals(cwd), [source]: rehearsal }, null, 2)}\n`);
}
