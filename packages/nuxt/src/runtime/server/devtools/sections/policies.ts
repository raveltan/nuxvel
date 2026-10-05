import policies from "#nuxvel/policies";
import { ruleAllowsSystem } from "../../policies/define-policy";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { Policy } from "../../policies/define-policy";
import type { PoliciesSectionData } from "../../../shared/devtools/sections/policies";

const registered: readonly Policy[] = policies;

export default defineDevtoolsSection<PoliciesSectionData>({
  id: "policies",
  title: "Policies",
  order: 60,
  load: async () =>
    registered
      .map((policy) => ({
        table: policy.tableName,
        rules: Object.entries(policy.rules).map(([name, rule]) => ({ name, allowsSystem: ruleAllowsSystem(rule) })),
      }))
      .sort((a, b) => a.table.localeCompare(b.table)),
});
