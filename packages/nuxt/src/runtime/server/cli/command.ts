import { z } from "zod";

const named = { name: z.string() };
const forUser = { userId: z.string() };

export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tinker") }),
  z.object({ kind: z.literal("db:seed"), names: z.array(z.string()) }),
  z.object({ kind: z.literal("task:run"), ...named, payload: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal("flags:list"), outFile: z.string() }),
  z.object({ kind: z.literal("flags:stale"), now: z.string(), outFile: z.string() }),
  z.object({
    kind: z.literal("flags:set"),
    ...named,
    percentage: z.number().min(0).max(100).optional(),
    role: z.string().optional(),
    value: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("experiment:start"), ...named }),
  z.object({ kind: z.literal("experiment:stop"), ...named }),
  z.object({ kind: z.literal("experiment:report"), ...named, outFile: z.string().optional() }),
  z.object({ kind: z.literal("audit:verify"), outFile: z.string() }),
  z.object({ kind: z.literal("audit:tail") }),
  z.object({
    kind: z.literal("audit:export"),
    from: z.string().optional(),
    to: z.string().optional(),
    format: z.enum(["csv", "jsonl"]),
  }),
  z.object({ kind: z.literal("backfill:status"), outFile: z.string() }),
  z.object({ kind: z.literal("billing:status"), outFile: z.string() }),
  z.object({ kind: z.literal("billing:replay"), eventId: z.string().min(1) }),
  z.object({ kind: z.literal("user:export"), ...forUser }),
  z.object({ kind: z.literal("user:erase"), ...forUser }),
  z.object({ kind: z.literal("queue:versions"), outFile: z.string() }),
  z.object({ kind: z.literal("queue:failed"), outFile: z.string() }),
  z.object({
    kind: z.literal("queue:clear"),
    queues: z.array(z.string()).optional(),
    failed: z.boolean(),
    waiting: z.boolean(),
  }),
  z.object({ kind: z.literal("queue:retry"), target: z.string(), queue: z.string().optional() }),
  z.object({ kind: z.literal("schedule:list"), outFile: z.string() }),
  z.object({ kind: z.literal("schedule:prune"), dryRun: z.boolean() }),
  z.object({ kind: z.literal("schedule:run"), ...named }),
  z.object({ kind: z.literal("routes"), outFile: z.string() }),
  z.object({ kind: z.literal("channels"), outFile: z.string() }),
  z.object({ kind: z.literal("openapi:export"), outFile: z.string().optional() }),
  z.object({ kind: z.literal("key:issue"), ...forUser, name: z.string().trim().min(1) }),
  z.object({ kind: z.literal("orphaned-names"), outFile: z.string() }),
  z.object({
    kind: z.literal("down"),
    message: z.string().optional(),
    retryAfter: z.number().int().positive().optional(),
    secret: z.string().optional(),
    allow: z.array(z.string()),
    keepQueue: z.boolean(),
  }),
  z.object({ kind: z.literal("up") }),
  z.object({ kind: z.literal("maintenance:status"), outFile: z.string() }),
]);

/**
 * A `nuxvel` CLI command that runs inside the app's Nitro server: the
 * CLI builds the server and starts it with the command, JSON-encoded, in
 * {@link COMMAND_ENV}.
 *
 * @internal Shared by the module's command plugin and `@nuxvel/cli`; not
 * meant for app code.
 */
export type NuxvelCommand = z.infer<typeof commandSchema>;

/**
 * The environment variable that makes a Nitro server run one
 * {@link NuxvelCommand} after boot, then exit with its code.
 *
 * @internal Shared by the module's command plugin and `@nuxvel/cli`; not
 * meant for app code.
 */
export const COMMAND_ENV = "NUXVEL_COMMAND";
