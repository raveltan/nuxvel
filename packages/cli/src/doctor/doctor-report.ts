import { plural, style, symbols } from "../ui/output.ts";
import type { DoctorFinding, DoctorStatus } from "./doctor-check.ts";

export interface DoctorRow {
  name: string;
  status: DoctorStatus;
  findings: DoctorFinding[];
}

const STATUSES: DoctorStatus[] = ["failed", "warning", "passed", "skipped"];

const GLYPHS: Record<DoctorStatus, string> = {
  failed: symbols.error,
  warning: symbols.warn,
  passed: symbols.success,
  skipped: symbols.skipped,
};

export function doctorRow(name: string, findings: DoctorFinding[]): DoctorRow {
  const status = STATUSES.find((candidate) => findings.some((finding) => finding.status === candidate)) ?? "passed";

  return { name, status, findings };
}

export function formatDoctorRow(row: DoctorRow, nameWidth: number) {
  const indent = " ".repeat(nameWidth + 4);
  const lines = row.findings.flatMap((finding) => [
    ...finding.detail.split("\n"),
    ...(finding.hint ? [`${style.dim("→")} ${finding.hint}`] : []),
  ]);
  const [first = "", ...rest] = lines;

  return [`${GLYPHS[row.status]} ${row.name.padEnd(nameWidth)}  ${first}`, ...rest.map((line) => `${indent}${line}`)];
}

export function summarizeDoctor(rows: DoctorRow[]) {
  const count = (status: DoctorStatus) => rows.filter((row) => row.status === status).length;

  return { failed: count("failed"), warning: count("warning"), passed: count("passed"), skipped: count("skipped") };
}

export function describeSummary(summary: ReturnType<typeof summarizeDoctor>) {
  const parts = [
    summary.failed > 0 ? `${summary.failed} failed` : undefined,
    summary.warning > 0 ? plural(summary.warning, "warning") : undefined,
    summary.passed > 0 ? `${summary.passed} passed` : undefined,
    summary.skipped > 0 ? `${summary.skipped} skipped` : undefined,
  ];

  return parts.filter((part) => part !== undefined).join(", ");
}
