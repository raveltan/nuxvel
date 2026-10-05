import { defineNitroPlugin } from "nitropack/runtime";
import type { NitroApp } from "nitropack/types";
import { COMMAND_ENV, commandSchema } from "../cli/command";
import { reportCommandFailure } from "../cli/command-error";
import { runCommand } from "../cli/run-command";
import { logEveryLevelOnStderr } from "../logging/log-record";
import { useLogger } from "../logging/logger";

function drained(stream: NodeJS.WriteStream) {
  return new Promise<void>((resolve) => stream.write("", () => resolve()));
}

function closeOnSignal(nitroApp: NitroApp) {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, async () => {
      await nitroApp.hooks.callHook("close");
      process.exit(0);
    });
  }
}

export default defineNitroPlugin((nitroApp) => {
  // the CLI's node-listener build has none of node-server's graceful shutdown, and close-connections' signal listeners turn off Node's default exit
  closeOnSignal(nitroApp);

  const encoded = process.env[COMMAND_ENV];

  if (!encoded) return;

  logEveryLevelOnStderr();

  const command = commandSchema.parse(JSON.parse(encoded));

  // nitro runs its plugins one after another while it boots; the command starts once every plugin has
  setImmediate(async () => {
    useLogger("console").restoreConsole();

    const code = await runCommand(command).catch(reportCommandFailure);

    await nitroApp.hooks.callHook("close");
    // process.exit drops writes still queued on a pipe, which is asynchronous on macOS
    await Promise.all([drained(process.stdout), drained(process.stderr)]);
    process.exit(code);
  });
});
