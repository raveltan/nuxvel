import { colors } from "consola/utils";
import { errorMessage } from "../errors/error-message";

export class CommandError extends Error {
  readonly hint?: string;

  constructor(message: string, options: { hint?: string } = {}) {
    super(message);
    this.name = "CommandError";
    this.hint = options.hint;
  }
}

// the server build replaces a literal process.env.DEBUG with false
const DEBUG_ENV = "DEBUG";

function debugging() {
  return (process.env[DEBUG_ENV] ?? "").split(",").some((name) => name.trim() === "nuxvel");
}

export function commandReport(line: string) {
  process.stderr.write(`${line}\n`);
}

export function commandSuccess(message: string) {
  commandReport(`${colors.green("✔")} ${message}`);
}

export function reportCommandFailure(failure: unknown): number {
  const message = errorMessage(failure);
  const hint =
    failure instanceof CommandError
      ? failure.hint
      : debugging()
        ? undefined
        : "Run again with DEBUG=nuxvel for the stack";

  commandReport(`${colors.red("✖")} ${message}`);
  if (hint) commandReport(`  ${colors.dim("→")} ${hint}`);
  if (debugging() && failure instanceof Error && failure.stack) commandReport(failure.stack);

  return 1;
}
