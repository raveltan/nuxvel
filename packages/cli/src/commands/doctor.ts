import { defineCommand } from "citty";
import { doctorChecks, urlDoctorChecks } from "../doctor/checks.ts";
import { skipped } from "../doctor/doctor-check.ts";
import { type DoctorRow, describeSummary, doctorRow, formatDoctorRow, summarizeDoctor } from "../doctor/doctor-report.ts";
import { loadEnvFile } from "../env/load-env-file.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { intro, message, outro } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "doctor",
    description:
      "Check the app's environment (shell and .env), database connection and migrations, what is stored under names nothing defines, maintenance mode, the cache Redis, bot protection, npm security advisories, the mail DNS records, the off-site backups and restore rehearsals of nuxvel.deploy.ts, and with --url its security headers, health endpoints and server-sent events.",
  },
  args: {
    url: {
      type: "string",
      description:
        "Base URL of a running app, e.g. http://localhost:3000, to also check its CSP header, health endpoints and server-sent events.",
      required: false,
    },
    ...jsonArg,
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { url, json } = args;
    const nameWidth = Math.max(...[...doctorChecks, ...urlDoctorChecks].map((check) => check.name.length));
    const rows: DoctorRow[] = [];

    const record = (row: DoctorRow) => {
      rows.push(row);
      if (!json) message(formatDoctorRow(row, nameWidth));
    };

    loadEnvFile(cwd);

    if (!json) intro("nuxvel doctor");

    for (const check of doctorChecks) {
      record(doctorRow(check.name, await check.run({ cwd })));
    }

    for (const check of urlDoctorChecks) {
      record(doctorRow(check.name, url ? await check.run({ cwd, url }) : [skipped("pass --url")]));
    }

    const summary = summarizeDoctor(rows);

    if (json) printJson({ checks: rows, summary });
    else outro(describeSummary(summary));

    if (summary.failed > 0) process.exitCode = 1;
  },
});
