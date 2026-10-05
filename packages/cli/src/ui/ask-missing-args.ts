import * as clack from "@clack/prompts";
import { type ArgsDef, type CommandDef, parseArgs } from "citty";
import { CliError, fail } from "./fail.ts";
import { isInteractive } from "./output.ts";

const MISSING_ARG = /^Missing required (?:positional )?argument: (?:--)?(\S+)$/;

function missingArg(argv: string[], args: ArgsDef) {
  try {
    parseArgs(argv, args);
    return undefined;
  } catch (failure) {
    const name = failure instanceof Error ? MISSING_ARG.exec(failure.message)?.[1] : undefined;
    return Object.entries(args).find(([key, def]) => (def.type === "positional" ? key.toUpperCase() : key) === name);
  }
}

function inTerminal() {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

/**
 * Asks in a TTY to confirm a destructive command, and returns only on yes.
 * Outside a TTY or in CI it fails with `refusal` and the `--force` hint.
 * On no or cancel it fails with `cancelled`.
 *
 * @param message The yes/no question.
 * @param refusal The error when it cannot ask.
 * @param cancelled The error when the answer is not yes.
 *
 * @example
 * ```ts
 * if (!args.force) await askConfirm("Remove every job?", "queue:clear needs a confirmation", "Cancelled: the queues are unchanged");
 * ```
 */
export async function askConfirm(message: string, refusal: string, cancelled: string) {
  if (!inTerminal() || !isInteractive()) fail(refusal, { hint: "Pass --force to run it without asking" });

  const answer = await clack.confirm({ message, initialValue: false, output: process.stderr });

  if (answer !== true) fail(cancelled);
}

/**
 * Asks in a TTY to pick one of `values`, and returns the answer. Outside a
 * TTY it returns `undefined` and asks nothing.
 */
export async function askChoice(message: string, values: readonly string[]) {
  if (!inTerminal()) return undefined;

  const answer = await clack.select({ message, options: values.map((value) => ({ value, label: value })), output: process.stderr });

  if (clack.isCancel(answer)) fail("Cancelled");

  return answer;
}

/**
 * Asks in a TTY for each required argument that `argv` does not give, and
 * returns `argv` with the answers added. Outside a TTY it returns `argv`
 * as it is, so citty reports the missing argument and the command exits 2.
 */
export async function askMissingArgs(command: CommandDef, argv: string[]) {
  if (!inTerminal()) return argv;

  const args = (typeof command.args === "function" ? await command.args() : await command.args) ?? {};
  let answered = argv;

  for (let missing = missingArg(answered, args); missing; missing = missingArg(answered, args)) {
    const [name, def] = missing;
    const answer = await clack.text({
      message: def.description ?? name,
      validate: (value) => (value?.trim() ? undefined : `Enter a value for ${name}`),
      output: process.stderr,
    });

    if (clack.isCancel(answer)) fail("Cancelled");

    answered = def.type === "positional" ? [...answered, answer.trim()] : [...answered, `--${name}=${answer.trim()}`];
  }

  return answered;
}

function problem(check: () => unknown) {
  try {
    check();
    return undefined;
  } catch (failure) {
    if (!(failure instanceof CliError)) throw failure;
    return failure.hint ? `${failure.message}. ${failure.hint}` : failure.message;
  }
}

/**
 * Asks in a TTY for fields one at a time when `specs` is empty, and returns
 * the answers. An empty answer stops the questions. `check` gets all the
 * fields so far, and a {@link CliError} from it shows as the error of the
 * answer, which the user then enters again. With `specs`, or outside a TTY,
 * it returns `specs` and asks nothing.
 *
 * @example
 * ```ts
 * const specs = await askFields(args._.slice(1), (specs) => parseFields(specs));
 * ```
 */
export async function askFields(specs: string[], check: (specs: string[]) => unknown) {
  if (specs.length > 0 || !inTerminal()) return specs;

  const answers: string[] = [];

  for (;;) {
    const answer = await clack.text({
      message: `Field ${answers.length + 1} as name[:type[=arg]][:modifier...]. Enter nothing to stop.`,
      validate: (value) => (value?.trim() ? problem(() => check([...answers, value.trim()])) : undefined),
      output: process.stderr,
    });

    if (clack.isCancel(answer)) fail("Cancelled");
    if (!answer?.trim()) return answers;

    answers.push(answer.trim());
  }
}
