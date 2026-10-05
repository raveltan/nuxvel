import { auditVerificationSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { error, success } from "../ui/output.ts";

const BREAK_DESCRIPTIONS = {
  modified: "its content no longer matches its hash",
  unlinked: "it does not point at the row before it, so a row was removed or rewritten",
};

export default defineCommand({
  meta: {
    name: "audit:verify",
    description: "Walk the audit log's hash chain and report the first modified or missing row.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const verification = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "audit:verify", outFile }),
      auditVerificationSchema,
    );

    if (!verification) {
      process.exitCode = 1;
      return;
    }

    const { checked, firstBreak } = verification;

    if (firstBreak) process.exitCode = 1;

    if (args.json) {
      printJson(verification);
      return;
    }

    if (!firstBreak) {
      success(`Audit chain intact: ${checked} rows verified`);
      return;
    }

    if (firstBreak.reason === "subject-modified") {
      error(
        `Audit subject ${firstBreak.id} was changed: its user ID or name does not match its MAC`,
        "The entries of this subject can name the wrong user. Compare audit_subjects with a backup",
      );
      return;
    }

    if (firstBreak.reason === "context-modified") {
      error(
        `Audit context of row ${firstBreak.id} was changed: its IP address or user agent does not match its MAC`,
        "Compare audit_context with a backup",
      );
      return;
    }

    error(
      `Audit chain broken at row ${firstBreak.id}: ${BREAK_DESCRIPTIONS[firstBreak.reason]} (${checked} rows verified before it)`,
      "Rows after it were not checked; compare it with a backup before trusting the log",
    );
  },
});
