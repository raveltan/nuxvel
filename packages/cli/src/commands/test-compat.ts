import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { defineCommand } from "citty";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { errorMessage } from "../error-message.ts";
import { runProjectBin } from "../run-project-bin.ts";
import { startDevServices } from "../services/start-dev-services.ts";
import { fail } from "../ui/fail.ts";
import { error, success } from "../ui/output.ts";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync("git", args, { cwd });

  return stdout.trim();
}

export default defineCommand({
  meta: {
    name: "test:compat",
    description:
      "Run the tests of an older git ref, the live release, against a database migrated with the migrations of the working tree, without its contract migrations.",
  },
  args: {
    against: {
      type: "string",
      required: true,
      description: "The git ref of the live release, such as a tag or origin/main.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const ref = args.against;
    const prefix = await git(cwd, ["rev-parse", "--show-prefix"]).catch((cause: unknown) =>
      fail(`${cwd} is not in a git repository: ${errorMessage(cause)}`, { hint: "Run nuxvel test:compat in the app's git checkout" }),
    );
    const scratch = mkdtempSync(join(tmpdir(), "nuxvel-compat-"));
    const archive = join(scratch, "release.tar");
    const releaseDir = join(scratch, "release");

    try {
      await git(cwd, ["archive", "--format=tar", "-o", archive, `${ref}:${prefix}`]).catch((cause: unknown) =>
        fail(`Could not check out ${ref}: ${errorMessage(cause)}`, { hint: "Pass a tag, branch or commit that git knows, such as origin/main" }),
      );
      mkdirSync(releaseDir);
      await execFileAsync("tar", ["-xf", archive, "-C", releaseDir]);

      const migrations = relative(cwd, (await readMigrationsConfig(cwd)).migrationsFolder);
      rmSync(join(releaseDir, migrations), { recursive: true, force: true });
      cpSync(join(cwd, migrations), join(releaseDir, migrations), { recursive: true });
      rmSync(join(releaseDir, migrations, "contract"), { recursive: true, force: true });
      symlinkSync(join(cwd, "node_modules"), join(releaseDir, "node_modules"));
      if (existsSync(join(cwd, ".env"))) cpSync(join(cwd, ".env"), join(releaseDir, ".env"));

      success(`Checked out ${ref} with the migrations of the working tree, without the contract migrations`);
      await startDevServices(cwd);

      const exitCode = await runProjectBin(releaseDir, "vitest", ["run", "--exclude", "tests/e2e/**"], {
        installHint: "npm i -D vitest",
      });

      if (exitCode !== 0) {
        error(
          `The tests of ${ref} fail against the new migrations`,
          "Keep what the live release reads for one more release, and remove it in the release after",
        );
        process.exitCode = exitCode;
        return;
      }

      success(`The tests of ${ref} pass against the new migrations`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
});
