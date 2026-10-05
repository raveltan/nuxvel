import { useNitroApp } from "nitropack/runtime";
import { commandSchema } from "../server/cli/command";
import { reportCommandFailure } from "../server/cli/command-error";
import { runCommand } from "../server/cli/run-command";
import { runTinker } from "../server/cli/tinker";
import { logEveryLevelOnStderr } from "../server/logging/log-record";
import { useLogger } from "../server/logging/logger";

function drained(stream: NodeJS.WriteStream) {
  return new Promise<void>((resolve) => stream.write("", () => resolve()));
}

function run(encoded: string | undefined) {
  return encoded ? runCommand(commandSchema.parse(JSON.parse(encoded))) : runTinker();
}

export async function startTinker(server: URL) {
  logEveryLevelOnStderr();
  await import(server.href);
  useLogger("console").restoreConsole();

  const code = await run(process.argv[2]).catch(reportCommandFailure);

  await useNitroApp().hooks.callHook("close");
  await Promise.all([drained(process.stdout), drained(process.stderr)]);
  process.exit(code);
}
