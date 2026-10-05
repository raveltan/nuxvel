import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { askRecoveryKey } from "../server/ask-recovery-key.ts";
import { serverRestoreScript } from "../server/restore-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { error, success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "dr:check",
    description: "Check that the recovery key decrypts the newest config bundle of the app, on the server and off-site.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const { app, server } = await loadEnvironment(process.cwd(), args.env);
    const recoveryKey = await askRecoveryKey("dr:check");
    const target = sshTarget(process.cwd(), server, "root");
    const results: string[] = [];

    await runOverSsh(target, serverRestoreScript("check-key", { recoveryKey, app }), (line) => results.push(line), {
      failure: "Checking the recovery key failed",
    });

    const mismatch = results.find((line) => line.startsWith("@mismatch "));
    if (mismatch) {
      fail(`This recovery key is not the one of ${server.host}: its public key is ${mismatch.slice("@mismatch ".length)}`, {
        hint: "Find the key that server:setup showed for this server",
      });
    }
    const bundles = results.flatMap((line) => {
      const [status, source, stamp] = line.split(" ");
      return status === "@decrypts" || status === "@fails" ? [{ ok: status === "@decrypts", source, stamp }] : [];
    });
    const offsite = results.find((line) => line.startsWith("@offsite-"));
    if (bundles.length === 0 && !offsite) fail(`${app} has no config bundle on ${server.host} or off-site yet`, { hint: `Make one with nuxvel db:backup ${args.env}` });

    for (const bundle of bundles) {
      if (bundle.ok) success(`The recovery key decrypts the ${bundle.source} config bundle ${bundle.stamp} of ${app}`);
      else error(`The recovery key does not decrypt the ${bundle.source} config bundle ${bundle.stamp} of ${app}`);
    }
    if (offsite === "@offsite-missing") error(`The off-site bucket has no config bundle of ${app}`);
    else if (offsite) error(`Reading the off-site bucket failed: ${offsite.slice("@offsite-unreadable ".length)}`);
    if (offsite || bundles.some((bundle) => !bundle.ok)) process.exitCode = 1;
  },
});
