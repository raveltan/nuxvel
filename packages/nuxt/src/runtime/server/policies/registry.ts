import type { Policy } from "./define-policy";

/**
 * Indexes policies by table name, throwing when two policies claim the
 * same table.
 */
export function policyRegistry(policies: readonly Policy[]): Map<string, Policy> {
  const registry = new Map<string, Policy>();

  for (const policy of policies) {
    if (registry.has(policy.tableName)) {
      throw new Error(
        `nuxvel: more than one policy is defined for table "${policy.tableName}"; merge them into one definePolicy()`,
      );
    }

    registry.set(policy.tableName, policy);
  }

  return registry;
}
