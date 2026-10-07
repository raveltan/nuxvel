import { z } from "zod";
import { FLAGS_CHANNEL } from "../../shared/flags/flag-values";
import { actorContext } from "../actions/context";
import { systemActor } from "../actions/system-actor";
import { broadcastOnCommit } from "../realtime/broadcast";
import { transaction } from "../database/transaction";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { audit } from "../utils/audit";
import type { Flag } from "./define-flag";
import { type FlagName, findFlag, flagStoredName } from "./registry";
import { parseStoredJson } from "./stored-json";
import { now } from "../clock/now";

/** Who a flag is on for, stored in Redis and changed at runtime. */
export interface FlagTargeting {
  /**
   * Share of users, 0 to 100, the flag is on for. The same users stay in
   * as it rises: raising 10 to 20 keeps the first 10% and adds another.
   */
  percentage?: number;
  /** A fixed value per role, winning over `percentage` for users with that role. */
  roles?: Record<string, boolean>;
}

/** A flag's stored {@link FlagTargeting}, with when it was last set. */
export interface StoredFlagTargeting extends FlagTargeting {
  /** ISO timestamp of the last {@link setFlagTargeting}; absent when never set. */
  updatedAt?: string;
}

const storedTargetingSchema = z.object({
  percentage: z.number().min(0).max(100).optional(),
  roles: z.record(z.string(), z.boolean()).optional(),
  updatedAt: z.string().optional(),
});

export function flagTargetingKey(name: string) {
  return redisKey(`nuxvel:flags:${name}`);
}

function flagName(nameOrFlag: string | Flag) {
  return typeof nameOrFlag === "string" ? nameOrFlag : nameOrFlag.name;
}

function storedTargetingKey(name: string) {
  return flagTargetingKey(flagStoredName(findFlag(name)));
}

export function parseTargeting(stored: string | null | undefined): StoredFlagTargeting {
  return parseStoredJson(storedTargetingSchema, stored) ?? {};
}

/**
 * The targeting currently stored for a flag, or an empty object when it
 * has none, or what is stored is not valid targeting, and everyone gets
 * its default.
 *
 * Auto-imported on the server. `flag` is a {@link FlagName}, so a
 * misspelled flag fails to compile, or the flag's definition
 * (`$flags.newCheckout` or an import).
 */
export async function flagTargeting(flag: FlagName | Flag): Promise<StoredFlagTargeting> {
  return parseTargeting(await useRedis("durable").get(storedTargetingKey(flagName(flag))));
}

/**
 * Replaces a flag's targeting, taking effect on the next evaluation in
 * every server process, with no deploy.
 *
 * Auto-imported on the server. Stored on the `durable` connection of
 * `useRedis()`. The change is written to the audit log as
 * `flag.targeted`, with the targeting `before` and `after`, attributed
 * to the actor in scope — or to a `flags` system actor when there is
 * none. The audit row is written first, in a transaction that also
 * covers the Redis write: when either fails, the audit row rolls back
 * and nothing is saved, so a thrown error means the targeting did not
 * change. It then broadcasts `changed` with `{ name }` on the `flags`
 * channel, so every open page using `useFlag()` refetches its values
 * without a reload. `nuxvel flag:set` calls it. `flag` is a
 * {@link FlagName} or the flag's definition; an unknown name also throws
 * at runtime.
 *
 * @example
 * ```ts
 * await setFlagTargeting("new-checkout", { percentage: 10, roles: { "beta-tester": true } });
 * await setFlagTargeting($flags.newCheckout, { percentage: 50 });
 * ```
 */
export async function setFlagTargeting(
  flag: FlagName | Flag,
  targeting: FlagTargeting,
): Promise<void> {
  const name = flagName(flag);
  const key = storedTargetingKey(name);

  const { updatedAt: _, ...before } = await flagTargeting(flag);
  const stored: StoredFlagTargeting = {
    ...targeting,
    updatedAt: now().toISOString(),
  };

  await transaction(async () => {
    await actorContext.run(actorContext.getStore() ?? systemActor("flags"), () =>
      audit("flag.targeted", { id: name }, { changes: { before, after: targeting } }),
    );
    await useRedis("durable").set(key, JSON.stringify(stored));
  });
  await broadcastOnCommit(FLAGS_CHANNEL, "changed", { name });
}
