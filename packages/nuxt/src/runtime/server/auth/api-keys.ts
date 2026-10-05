import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getRequestHeader } from "h3";
import { useEvent } from "nitropack/runtime";
import { apiKeyActor } from "../actions/api-key-actor";
import type { Actor } from "../actions/system-actor";
import { useDb } from "../database/client";
import { firstOrFail } from "../database/first-or-fail";
import { schemaTable } from "../database/schema-table";
import { UnauthenticatedError } from "../errors/unauthenticated-error";
import { rememberActor } from "../logging/log-context";
import { API_KEY_RATE_LIMIT } from "../security/rate-limit-registry";
import { rateLimiter } from "../security/rate-limit";
import type { SessionUser } from "../utils/auth";
import { now } from "../clock/now";
import { currentEvent } from "../utils/current-event";

const API_KEY_PREFIX = "nxk_";

export interface ApiKeySummary {
  id: string;
  name: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function issueApiKey(
  userId: string,
  options: { name: string; expiresAt?: Date },
): Promise<Pick<ApiKeySummary, "id" | "name" | "expiresAt"> & { key: string }> {
  const apiKeys = schemaTable("api_keys");
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await useDb()
    .insert(apiKeys)
    .values({ userId, name: options.name, expiresAt: options.expiresAt, keyHash: hashApiKey(key) })
    .returning({ id: apiKeys.id, name: apiKeys.name, expiresAt: apiKeys.expiresAt })
    .then(firstOrFail);

  return { ...row, key };
}

export async function revokeApiKeys(userId: string): Promise<void> {
  const apiKeys = schemaTable("api_keys");

  await useDb().delete(apiKeys).where(eq(apiKeys.userId, userId));
}

export function requestApiKey(): string | undefined {
  const event = currentEvent();

  if (!event) return undefined;

  const [scheme, token] = getRequestHeader(event, "authorization")?.split(" ") ?? [];

  return scheme?.toLowerCase() === "bearer" && token?.startsWith(API_KEY_PREFIX) ? token : undefined;
}

export async function authenticateApiKey(key: string): Promise<{ user: SessionUser; actor: Actor }> {
  const apiKeys = schemaTable("api_keys");
  const user = schemaTable("user");
  const [found] = await useDb()
    .select({ key: apiKeys, user })
    .from(apiKeys)
    .innerJoin(user, eq(user.id, apiKeys.userId))
    .where(eq(apiKeys.keyHash, hashApiKey(key)));

  if (!found || (found.key.expiresAt && found.key.expiresAt <= now())) {
    throw new UnauthenticatedError("Invalid or expired API key");
  }

  const actor = apiKeyActor(found.key);

  await rateLimiter(API_KEY_RATE_LIMIT).consume(`api-key:${found.key.id}`);
  await useDb().update(apiKeys).set({ lastUsedAt: now() }).where(eq(apiKeys.id, found.key.id));
  rememberActor(useEvent(), actor);

  return { user: found.user, actor };
}
