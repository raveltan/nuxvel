import { z } from "zod";

const colorSchema = z.enum(["blue", "green"]);

const processesSchema = z.object({ web: z.number(), worker: z.number() });

const stateSchema = z.object({
  active: colorSchema.nullable(),
  releases: z.object({ blue: z.string().nullable(), green: z.string().nullable() }),
  processes: z.object({ blue: processesSchema.optional(), green: processesSchema.optional() }).optional(),
  contractMigrations: z.array(z.string()),
});

export const serverStateSchema = z.object({
  registry: z.object({
    node: z.string(),
    cpus: z.number(),
    memory: z.object({ appsMb: z.number() }),
    services: z.object({ postgres: z.object({ maxConnections: z.number() }) }),
    apps: z.record(
      z.string(),
      z.object({ folder: z.string(), ports: z.object({ blue: z.tuple([z.number(), z.number()]), green: z.tuple([z.number(), z.number()]) }) }),
    ),
  }),
  states: z.record(z.string(), stateSchema),
  releases: z.array(z.string()),
});

export type ServerState = z.output<typeof serverStateSchema>;
