import { defineCommand } from "citty";
import { verifyArchive } from "../build/verify-archive.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { error, report, success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "build:verify",
    description: "Check an archive's checksum and build manifest against this machine before running it.",
  },
  args: {
    ...jsonArg,
    archive: {
      type: "positional",
      description: "Path to an archive from `nuxvel build --artifact`.",
      required: true,
    },
  },
  async run({ args }) {
    const verification = await verifyArchive(args.archive);

    if (!verification.ok) process.exitCode = 1;

    if (args.json) {
      printJson({ archive: args.archive, ...verification });
      return;
    }

    if (!verification.ok) {
      error(`${args.archive} failed verification`);
      for (const problem of verification.problems) report(`  ${problem}`);
      return;
    }

    const { app, commit, platform, arch, libc, node } = verification.manifest;
    success(
      `${args.archive} verified: ${app} ${commit ?? "(no commit)"}, ${platform}/${arch}${libc ? ` ${libc}` : ""}, Node ${node}`,
    );
  },
});
