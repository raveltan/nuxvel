import { stripVTControlCharacters } from "node:util";
import { errorMessage } from "../error-message.ts";
import { commandName } from "../help-args.ts";
import { error, report } from "./output.ts";

interface CliErrorOptions {
  /** The next command or fix, printed as `  → <hint>`. */
  hint?: string;
  /** The process exit code: `1` (the default) for a failure, `2` for a usage error. */
  exitCode?: number;
  cause?: unknown;
}

/**
 * An expected failure: the entry point prints it as `✖ <message>` and
 * `  → <hint>` on stderr, with no stack, and exits with `exitCode`.
 */
export class CliError extends Error {
  readonly hint?: string;
  readonly exitCode: number;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "CliError";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

/**
 * Stops the command with a {@link CliError}.
 *
 * @example
 * ```ts
 * if (!url) fail("NUXT_DATABASE_URL is not set", { hint: "Add it to .env" });
 * ```
 */
export function fail(message: string, options?: CliErrorOptions): never {
  throw new CliError(message, options);
}

function isUsageError(value: unknown): value is Error & { code: string } {
  return value instanceof Error && value.name === "CLIError" && "code" in value && typeof value.code === "string";
}

function debugging() {
  return (process.env.DEBUG ?? "").split(",").some((name) => name.trim() === "nuxvel");
}

function usageHint(rawArgs: string[], code: string) {
  const command = commandName(rawArgs);

  if (code === "E_NO_COMMAND" || command === undefined) {
    return "Run nuxvel --help to list commands";
  }

  return `Run nuxvel ${command} --help for its usage`;
}

/**
 * Prints any error the way the entry point does, and returns the exit
 * code to use: a {@link CliError} as `✖`/`→`, citty's usage errors with
 * exit code `2`, anything else as one line (the stack under
 * `DEBUG=nuxvel`).
 */
export function reportFailure(failure: unknown, rawArgs: string[]) {
  if (failure instanceof CliError) {
    error(failure.message, failure.hint);
    if (debugging() && failure.stack) report(failure.stack);
    return failure.exitCode;
  }

  if (isUsageError(failure)) {
    error(stripVTControlCharacters(failure.message), usageHint(rawArgs, failure.code));
    return 2;
  }

  const text = errorMessage(failure);

  if (debugging()) {
    error(text);
    report(failure instanceof Error && failure.stack ? failure.stack : String(failure));
  } else {
    error(text, "Run again with DEBUG=nuxvel for the stack");
  }

  return 1;
}
