import { z } from "zod";
import { parseStoredJson } from "../flags/stored-json";
import { MAINTENANCE_CHANNEL } from "../../shared/maintenance/maintenance-channel";
import { useQueue } from "../jobs/queue";
import { broadcastOnCommit } from "../realtime/broadcast";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { now } from "../clock/now";

function maintenanceKey() {
  return redisKey("nuxvel:maintenance");
}

const DEFAULT_MAINTENANCE_MESSAGE = "The app is down for maintenance. Please check back soon.";

const DEFAULT_RETRY_AFTER = 60;

const maintenanceStateSchema = z.object({
  message: z.string(),
  retryAfter: z.number(),
  secret: z.string().nullable(),
  allow: z.array(z.string()),
  keepQueue: z.boolean(),
  since: z.string(),
});

export type MaintenanceState = z.infer<typeof maintenanceStateSchema>;

export type MaintenanceOptions = Partial<Omit<MaintenanceState, "since">>;

export async function maintenanceState(): Promise<MaintenanceState | undefined> {
  return parseStoredJson(maintenanceStateSchema, await useRedis("durable").get(maintenanceKey()));
}

export async function goDown(options: MaintenanceOptions): Promise<MaintenanceState> {
  const state: MaintenanceState = {
    message: options.message ?? DEFAULT_MAINTENANCE_MESSAGE,
    retryAfter: options.retryAfter ?? DEFAULT_RETRY_AFTER,
    secret: options.secret ?? null,
    allow: options.allow ?? [],
    keepQueue: options.keepQueue ?? false,
    since: now().toISOString(),
  };

  await useRedis("durable").set(maintenanceKey(), JSON.stringify(state));

  if (state.keepQueue) await useQueue().resume();
  else await useQueue().pause();

  await broadcastOnCommit(MAINTENANCE_CHANNEL, "down", { message: state.message, retryAfter: state.retryAfter });

  return state;
}

export async function goUp(): Promise<boolean> {
  const removed = await useRedis("durable").del(maintenanceKey());

  await useQueue().resume();
  await broadcastOnCommit(MAINTENANCE_CHANNEL, "up", {});

  return removed > 0;
}
