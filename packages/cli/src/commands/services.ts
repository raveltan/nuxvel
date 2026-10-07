import { defineCommand } from "citty";
import { composeFile, isHealthy, serviceStates, startDevServices, stopDevServices } from "../services/start-dev-services.ts";
import { fail } from "../ui/fail.ts";
import { print, symbols } from "../ui/output.ts";

async function printStatus(cwd: string) {
  const states = await serviceStates(cwd).catch((cause: unknown) =>
    fail("Could not read the state of the services from docker compose", { hint: "Check that Docker runs", cause }),
  );

  for (const { service, state } of states) {
    print(`${isHealthy(state) ? symbols.success : symbols.error} ${service}  ${state}`);
  }

  return states.every(({ state }) => isHealthy(state));
}

export default defineCommand({
  meta: {
    name: "services",
    description: "Start (up), stop (down) or show (status) the docker compose services that nuxvel dev and nuxvel test:functional use.",
  },
  args: {
    action: {
      type: "positional",
      description: "up, down or status.",
      required: true,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    if (!["up", "down", "status"].includes(args.action)) {
      fail(`Unknown action "${args.action}"`, { hint: "Use up, down or status", exitCode: 2 });
    }

    if (!composeFile(cwd)) {
      fail("No docker-compose.yml or compose.yml in this folder", { hint: "Run it in the root folder of the app" });
    }

    const ok =
      args.action === "up" ? await startDevServices(cwd, { continues: false, stopOnExit: false }) : args.action === "down" ? await stopDevServices(cwd) : await printStatus(cwd);

    if (!ok) process.exitCode = 1;
  },
});
