import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { defineCommand } from "citty";
import { describeLock } from "../deploy/deploy-session.ts";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { envHash, localEnvFile, pulledHashFile, readSharedEnv } from "../deploy/shared-env-file.ts";
import { sharedEnvProblems } from "../deploy/shared-env-problems.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { hint, print, printLine, report, success } from "../ui/output.ts";

function changedNames(before: string, after: string) {
  const old = parseEnv(before);
  const next = parseEnv(after);

  return [
    ...Object.keys(next).filter((name) => old[name] !== next[name]).map((name) => `set ${name}`),
    ...Object.keys(old).filter((name) => !(name in next)).map((name) => `remove ${name}`),
  ];
}

export default defineCommand({
  meta: {
    name: "env:push",
    description: "Check .nuxvel/<env>.env against the boot checks and upload it as shared/.env of the app on the server.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { app, server } = await loadEnvironment(cwd, args.env);
    const file = localEnvFile(args.env);

    if (!existsSync(join(cwd, file))) fail(`${file} is missing`, { hint: `Copy the server's file first with nuxvel env:pull ${args.env}` });
    const contents = readFileSync(join(cwd, file), "utf8");
    const quoted = contents.match(/^[A-Za-z_]\w*(?==["'`])/gm) ?? [];
    if (quoted.length > 0) {
      fail(`${file} puts quotes around the value of ${quoted.join(", ")}`, {
        hint: "Write each line as KEY=value with no quotes (the server scripts read the value as it is), nothing is uploaded",
      });
    }
    const problems = await sharedEnvProblems(contents);
    if (problems.length > 0) {
      fail(`${file} fails the server's boot checks: ${problems.map(({ message }) => message).join(", ")}`, {
        hint: "Fix it and push again, nothing is uploaded",
      });
    }

    const target = sshTarget(cwd, server);
    const remote = await readSharedEnv(target, app);
    const changes = changedNames(remote, contents);
    if (changes.length === 0) {
      success(`shared/.env of ${app} on ${server.host} already matches ${file}, nothing to change`);
      return;
    }
    const hashFile = join(cwd, pulledHashFile(args.env));
    if ((existsSync(hashFile) ? readFileSync(hashFile, "utf8") : "") !== envHash(remote)) {
      fail(`shared/.env of ${app} on ${server.host} changed after the last nuxvel env:pull ${args.env}`, {
        hint: `Pull it again with nuxvel env:pull ${args.env} and make your changes again, nothing is uploaded`,
      });
    }

    let result = "";
    await runOverSsh(
      target,
      deployScript("env-write", { APP: app, APP_DIR: `/srv/apps/${app}`, CONTENTS: contents }),
      (line) => {
        if (line.startsWith("@")) result = line;
        else printLine(line);
      },
      { failure: "Uploading shared/.env failed" },
    );
    if (result.startsWith("@locked ")) {
      fail(`${app} is being deployed ${describeLock(result.slice("@locked ".length))}`, {
        hint: "Push again once that deploy has finished, nothing is uploaded",
      });
    }

    writeFileSync(hashFile, envHash(await readSharedEnv(target, app)));
    for (const change of changes) print(`~ ${change}`);
    success(`Uploaded ${file} as shared/.env of ${app} on ${server.host}`);
    report(
      hint(
        `Each process reads it when it starts: nuxvel deploy ${args.env} starts all of them with it, and a process that pm2 restarts before then (after a crash or a reboot) also gets it`,
      ),
    );
  },
});
