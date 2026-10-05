import { type ConsolaInstance, type ConsolaReporter, LogLevels, createConsola } from "consola/core";
import { LOG_FORMATS, LOG_LEVELS, type LogFormat, type LogLevelName } from "../../shared/env/log-settings";
import { publishObserved } from "../observe/channels";
import { writeJsonLine } from "./json-reporter";
import { logContext } from "./log-context";
import { type LogRecord, logRecord } from "./log-record";
import { writePrettyLine } from "./pretty-reporter";

function isOneOf<Value extends string>(values: readonly Value[], value: string | undefined): value is Value {
  return values.some((candidate) => candidate === value);
}

function configuredLevel() {
  const name = process.env.NUXT_LOG_LEVEL;

  return isOneOf<LogLevelName>(LOG_LEVELS, name) ? LogLevels[name] : LogLevels.info;
}

function configuredFormat(): LogFormat {
  const format = process.env.NUXT_LOG_FORMAT;

  if (isOneOf<LogFormat>(LOG_FORMATS, format)) return format;

  return import.meta.dev ? "pretty" : "json";
}

export const logFormat = configuredFormat();

const writeLine: (record: LogRecord) => void = logFormat === "json" ? writeJsonLine : writePrettyLine;

const reporter: ConsolaReporter = {
  log(log) {
    // nitro's cache console.errors every failure it then passes to captureError, which the error-tracking plugin logs
    if (log.tag === "console" && String(log.args[0]).startsWith("[cache]")) return;

    const record = logRecord(log, logContext());

    publishObserved("log", {
      level: record.level,
      message: record.msg,
      ...(record.tag ? { tag: record.tag } : {}),
      ...(Object.keys(record.fields).length > 0 ? { fields: record.fields } : {}),
      ...(record.err ? { err: record.err } : {}),
    });
    writeLine(record);
  },
};

const rootLogger = createConsola({ level: configuredLevel(), throttle: 0, reporters: [reporter] });
const taggedLoggers = new Map<string, ConsolaInstance>();

/**
 * The server logger: a consola instance whose lines are pretty in dev
 * and one JSON object per line everywhere else.
 *
 * Auto-imported on the server. `fatal`, `error`, `warn`, `info`, `debug`
 * and `trace` are its levels; consola's other methods (`log`,
 * `success`, `fail`, `ready`, `start`, `box`) log at `info`. `warn` and above go to
 * stderr, the rest to stdout; while a CLI command runs, every level goes
 * to stderr. Pass a string for the message, plain
 * objects for fields and an `Error` for `err`, in any order. A line
 * logged during a request carries its {@link currentRequestId} as
 * `requestId`, and `actor` (`"user:<id>"`) once {@link auth} or the
 * running action has named one; logging never looks a session up. The level
 * comes from `NUXT_LOG_LEVEL` (default `info`) and the format from
 * `NUXT_LOG_FORMAT` (`pretty` or `json`). Loggers are cached per tag.
 *
 * @param tag Names the part of the app a line comes from, e.g. `billing`.
 *
 * @example
 * ```ts
 * const log = useLogger("billing");
 *
 * log.info("invoice paid", { invoiceId: invoice.id, amount: invoice.total });
 * log.error("charge failed", error, { invoiceId: invoice.id });
 * ```
 */
export function useLogger(tag?: string): ConsolaInstance {
  if (!tag) return rootLogger;

  let logger = taggedLoggers.get(tag);

  if (!logger) {
    logger = rootLogger.withTag(tag);
    taggedLoggers.set(tag, logger);
  }

  return logger;
}
