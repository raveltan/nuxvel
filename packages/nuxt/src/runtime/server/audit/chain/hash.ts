import { createHmac } from "node:crypto";
import { useSecrets } from "../../security/secrets";

export interface AuditEntryContent {
  occurredAt: Date;
  actorType: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  changes: unknown;
  metadata: unknown;
  requestId: string | null;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);

  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => [key, sortKeys(nested)]),
  );
}

function asStoredJson(value: unknown): unknown {
  return value === undefined || value === null ? null : JSON.parse(JSON.stringify(value));
}

export function auditContent(entry: AuditEntryContent, prevHash: string | null) {
  return JSON.stringify(
    sortKeys({
      occurredAt: entry.occurredAt.toISOString(),
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      changes: asStoredJson(entry.changes),
      metadata: asStoredJson(entry.metadata),
      requestId: entry.requestId,
      prevHash,
    }),
  );
}

function chainSecret() {
  const secret = process.env.NUXT_AUDIT_CHAIN_SECRET;

  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("NUXT_AUDIT_CHAIN_SECRET is not set");

  return useSecrets("NUXT_AUTH_SECRET")[0];
}

export function auditHash(entry: AuditEntryContent, prevHash: string | null) {
  return createHmac("sha256", chainSecret()).update(auditContent(entry, prevHash)).digest("hex");
}

export function auditRowMac(values: readonly unknown[]) {
  return createHmac("sha256", chainSecret()).update(JSON.stringify(values)).digest("hex");
}
