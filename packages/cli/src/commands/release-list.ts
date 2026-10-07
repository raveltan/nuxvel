import { defineCommand } from "citty";
import { z } from "zod";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { report } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

const releasesSchema = z.array(
  z.object({
    name: z.string(),
    commit: z.string().nullable(),
    source: z.string().nullable(),
    colors: z.array(z.string()),
    live: z.boolean(),
  }),
);

function deployedAt(name: string) {
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(name);
  return time ? `${time[1]}-${time[2]}-${time[3]} ${time[4]}:${time[5]}:${time[6]} UTC` : "-";
}

export default defineCommand({
  meta: {
    name: "release:list",
    description: "List the releases of the app on the server of an environment, newest first.",
  },
  args: {
    ...jsonArg,
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { app, server } = await loadEnvironment(cwd, args.env);
    let releases: z.output<typeof releasesSchema> | undefined;
    let active: string | undefined;

    await runOverSsh(
      sshTarget(cwd, server),
      deployScript("releases", { APP: app, APP_DIR: `/srv/apps/${app}` }),
      (line) => {
        if (line.startsWith("@active ")) active = line.slice("@active ".length);
        if (line.startsWith("@releases ")) releases = releasesSchema.parse(JSON.parse(line.slice("@releases ".length)));
      },
      { failure: "Listing the releases failed" },
    );
    if (!releases) fail(`${app} is not on ${server.host}`, { hint: `Deploy it with nuxvel deploy ${args.env}` });

    if (args.json) {
      printJson({ releases: releases.map((release) => ({ ...release, deployedAt: deployedAt(release.name) })) });
      return;
    }
    if (releases.length === 0) {
      report(`${app} has no release on ${server.host}`);
      return;
    }

    printTable(
      ["RELEASE", "COMMIT", "SOURCE", "DEPLOYED", "COLOR"],
      releases.map((release) => [
        release.name,
        release.commit?.slice(0, 7) ?? "-",
        release.source ?? "-",
        deployedAt(release.name),
        release.colors.map((color) => (color === active ? `${color} (live)` : color)).join(", ") || "-",
      ]),
    );
  },
});
