import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { alertTestScript } from "../server/alert-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { error, success } from "../ui/output.ts";

const CHANNELS: Record<string, string> = { email: "email", webhook: "webhook", heartbeat: "heartbeat URL" };

export default defineCommand({
  meta: {
    name: "alerts:test",
    description: "Send a test alert from the server of an environment through each alert channel, and report each one.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const { server } = await loadEnvironment(process.cwd(), args.env);
    const target = sshTarget(process.cwd(), server, "root");
    const results: { channel: string; ok: boolean; detail: string }[] = [];
    let none = false;

    await runOverSsh(
      target,
      alertTestScript(),
      (line) => {
        if (line === "@none") none = true;
        const [, channel = "", status, ...detail] = /^@channel (\S+) (ok|failed) ?(.*)$/.exec(line) ?? [];
        if (status) results.push({ channel, ok: status === "ok", detail: detail.join(" ") });
      },
      { failure: "Sending the test alert failed" },
    );

    if (none) {
      fail(`${server.host} has no alert channel`, { hint: `Set alerts in nuxvel.deploy.ts and run nuxvel server:setup ${args.env}` });
    }
    for (const result of results) {
      const name = CHANNELS[result.channel] ?? result.channel;
      if (result.ok) success(`Sent the test alert through the ${name}`);
      else error(`The ${name} failed: ${result.detail}`);
    }
    if (results.some((result) => !result.ok)) process.exitCode = 1;
  },
});
