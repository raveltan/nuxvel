import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { upgradeScript } from "../server/upgrade-script.ts";
import { printLine, success, warn } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "server:upgrade",
    description: "Install the waiting security updates on the server of an environment and restart what uses them.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    reboot: {
      type: "boolean",
      description: "Reboot the server when an update needs it.",
    },
  },
  async run({ args }) {
    const { server } = await loadEnvironment(process.cwd(), args.env);
    const target = sshTarget(process.cwd(), server, "root");
    let changes = 0;
    let rebootFor: string | undefined;

    await runOverSsh(
      target,
      upgradeScript({ reboot: args.reboot === true }),
      (line) => {
        if (line.startsWith("@reboot-required")) rebootFor = line.slice("@reboot-required".length).trim();
        else {
          if (line.startsWith("~ ")) changes += 1;
          printLine(line);
        }
      },
      { failure: "The upgrade failed" },
    );

    if (rebootFor !== undefined) {
      warn(
        `root@${server.host} needs a reboot${rebootFor ? ` for ${rebootFor}` : ""}`,
        `Reboot it with nuxvel server:upgrade ${args.env} --reboot, the apps are down until it is back`,
      );
    }
    if (changes === 0) success(`root@${server.host} has no security update to install`);
    else success(`Upgraded root@${server.host}`);
  },
});
