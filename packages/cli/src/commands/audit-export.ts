import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { fail } from "../ui/fail.ts";

function isAuditExportFormat(format: string): format is "csv" | "jsonl" {
  return format === "csv" || format === "jsonl";
}

function toIsoDate(value: string | undefined) {
  if (value === undefined) return undefined;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default defineCommand({
  meta: {
    name: "audit:export",
    description: "Print the audit log rows in a time range as CSV or JSON lines.",
  },
  args: {
    from: {
      type: "string",
      description: "Earliest occurredAt to include, e.g. 2026-09-01 (UTC unless the value has a zone).",
    },
    to: {
      type: "string",
      description: "occurredAt to stop before, exclusive, e.g. 2026-10-01.",
    },
    format: {
      type: "string",
      description: "csv or jsonl. Defaults to jsonl.",
      default: "jsonl",
    },
  },
  async run({ args }) {
    const from = toIsoDate(args.from);
    const to = toIsoDate(args.to);

    if (from === null || to === null) {
      fail("--from and --to must be dates", { hint: "e.g. --from 2026-09-01 or --from 2026-09-01T12:00:00Z", exitCode: 2 });
    }

    if (!isAuditExportFormat(args.format)) {
      fail(`Unknown --format=${args.format}`, { hint: "Use --format csv or --format jsonl", exitCode: 2 });
    }

    process.exitCode = await runCommandInApp(process.cwd(), { kind: "audit:export", from, to, format: args.format });
  },
});
