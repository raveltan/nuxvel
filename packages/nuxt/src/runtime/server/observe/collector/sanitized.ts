export const SECRET_KEY = /password|token|secret|authorization|cookie|api[-_]?key/i;
export const REDACTED = "[redacted]";

const MAX_STRING = 2048;
const MAX_ITEMS = 100;
const MAX_DEPTH = 6;
const CUT = "…";

interface Budget {
  left: number;
  exceeded: boolean;
}

function spend(budget: Budget, bytes: number) {
  budget.left -= bytes;
  if (budget.left < 0) budget.exceeded = true;

  return !budget.exceeded;
}

function copyString(value: string, budget: Budget) {
  const limit = Math.min(MAX_STRING, Math.max(0, budget.left - 2));

  if (limit < Math.min(value.length, MAX_STRING)) budget.exceeded = true;

  const kept = value.length > limit ? `${value.slice(0, limit)}${CUT}` : value;

  spend(budget, kept.length + 2);

  return kept;
}

function copy(value: unknown, depth: number, budget: Budget): unknown {
  if (typeof value === "string") return copyString(value, budget);
  if (typeof value === "bigint") return copyString(String(value), budget);
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value !== "object") {
    spend(budget, String(value).length);
    return value;
  }
  if (value instanceof Date) return copyString(value.toISOString(), budget);
  if (value instanceof Error) return { name: copyString(value.name, budget), message: copyString(value.message, budget) };
  if (depth >= MAX_DEPTH) return "[nested]";

  if (Array.isArray(value)) {
    const items: unknown[] = [];

    for (const item of value.slice(0, MAX_ITEMS)) {
      if (!spend(budget, 1)) break;
      items.push(copy(item, depth + 1, budget));
    }

    return items;
  }

  const fields: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value).slice(0, MAX_ITEMS)) {
    if (!spend(budget, key.length + 4)) break;
    fields[key] = SECRET_KEY.test(key) ? REDACTED : copy(item, depth + 1, budget);
  }

  return fields;
}

export function sanitizedWithin<T>(value: T, maxBytes: number): { value: T; cut: boolean };
export function sanitizedWithin(value: unknown, maxBytes: number) {
  const budget = { left: maxBytes, exceeded: false };

  return { value: copy(value, 0, budget), cut: budget.exceeded };
}
