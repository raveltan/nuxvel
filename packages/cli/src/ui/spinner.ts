import * as clack from "@clack/prompts";
import { error, hint, isInteractive, report, style, symbols } from "./output.ts";

interface Spinner {
  /** Ends the step as done: `◇ <message> (1.2s)`. */
  done(message?: string): void;
  /** Ends the step as failed: `✖ <message> (1.2s)`. */
  fail(message?: string): void;
}

/**
 * Starts a step with no output of its own on stderr. On a TTY outside CI
 * it is a clack spinner; otherwise it prints one static line when it
 * ends, with no `\r` and no cursor escapes.
 */
export function startSpinner(title: string): Spinner {
  const startedAt = performance.now();
  const took = () => style.duration(performance.now() - startedAt);

  if (!isInteractive()) {
    return {
      done: (message = title) => report(`${symbols.step} ${message} ${took()}`),
      fail: (message = title) => report(`${symbols.error} ${message} ${took()}`),
    };
  }

  const spinner = clack.spinner({ output: process.stderr, withGuide: false });
  spinner.start(title);

  return {
    done: (message = title) => spinner.stop(`${message} ${took()}`),
    fail: (message = title) => spinner.error(`${message} ${took()}`),
  };
}

/**
 * A captured tool's output, started with {@link startTaskLog}.
 */
export interface TaskLog {
  /** Adds a chunk of the tool's output. */
  write(chunk: string): void;
  /** Ends as done: the output is dropped, `◇ <message> (1.2s)` stays. */
  done(message: string): void;
  /** Ends as failed: `✖ <message>`, the hint, then the whole output. */
  fail(message: string, hintText?: string): void;
}

/**
 * Captures a tool's output on stderr (`docker compose`, `nuxt prepare`):
 * on a TTY outside CI the last lines scroll under the title and collapse
 * on success; otherwise nothing prints until it ends. Either way the
 * whole output is printed when it fails.
 */
export function startTaskLog(title: string): TaskLog {
  const startedAt = performance.now();
  const took = () => style.duration(performance.now() - startedAt);
  let output = "";

  const printOutput = () => {
    for (const line of output.trimEnd().split("\n")) report(`  ${style.dim(line)}`);
  };

  if (!isInteractive()) {
    return {
      write: (chunk) => (output += chunk),
      done: (message) => report(`${symbols.step} ${message} ${took()}`),
      fail: (message, hintText) => {
        error(`${message} ${took()}`, hintText);
        if (output.trim() !== "") printOutput();
      },
    };
  }

  const log = clack.taskLog({ title, output: process.stderr, limit: 8, withGuide: false });
  let pending = "";

  return {
    write: (chunk) => {
      output += chunk;
      const lines = (pending + chunk).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) log.message(line);
    },
    done: (message) => log.success(`${message} ${took()}`),
    fail: (message, hintText) => {
      log.error(`${message} ${took()}`, { showLog: false });
      if (hintText) report(hint(hintText));
      if (output.trim() !== "") printOutput();
    },
  };
}
