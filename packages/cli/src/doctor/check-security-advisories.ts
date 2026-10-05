import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { isRecord } from "../is-record.ts";
import { plural } from "../ui/output.ts";
import { type DoctorCheck, passed, skipped, warning } from "./doctor-check.ts";

const execFileAsync = promisify(execFile);

const SEVERITIES = ["critical", "high", "moderate", "low", "info"] as const;

const auditReportSchema = z.object({
  error: z.object({ code: z.string().optional(), summary: z.string().optional() }).optional(),
  vulnerabilities: z.record(z.string(), z.unknown()).optional(),
  metadata: z
    .object({ vulnerabilities: z.partialRecord(z.enum([...SEVERITIES, "total"]), z.number()).optional() })
    .optional(),
});

async function npmAudit(cwd: string): Promise<string | undefined> {
  try {
    return (await execFileAsync("npm", ["audit", "--json", "--omit=dev"], { cwd, timeout: 60_000, maxBuffer: 64 << 20 }))
      .stdout;
  } catch (error) {
    return isRecord(error) && typeof error.stdout === "string" && error.stdout ? error.stdout : undefined;
  }
}

function auditReport(output: string) {
  try {
    return auditReportSchema.safeParse(JSON.parse(output)).data;
  } catch {
    return undefined;
  }
}

export const checkSecurityAdvisories: DoctorCheck = {
  name: "security advisories",
  async run({ cwd }) {
    const output = await npmAudit(cwd);
    const report = output ? auditReport(output) : undefined;

    if (!report) return [skipped("npm audit gave no report, the network may be down")];
    if (report.error) return [skipped(`npm audit failed: ${report.error.summary ?? report.error.code ?? "unknown error"}`)];

    const counts = report.metadata?.vulnerabilities ?? {};
    const total = counts.total ?? 0;

    if (total === 0) return [passed("no known advisories for the production dependencies")];

    const bySeverity = SEVERITIES.flatMap((severity) => (counts[severity] ? [`${counts[severity]} ${severity}`] : []));
    const nuxt = report.vulnerabilities && "nuxt" in report.vulnerabilities ? ", nuxt among them" : "";

    return [
      warning(
        `${plural(total, "vulnerable package")} (${bySeverity.join(", ")})${nuxt}`,
        "Run npm audit for the advisories, and npm audit fix to update",
      ),
    ];
  },
};
