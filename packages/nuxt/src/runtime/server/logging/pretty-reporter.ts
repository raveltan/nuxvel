import { type ColorFunction, colors } from "consola/utils";
import { type LineLevel, type LogRecord, outputStream, type SerializedError } from "./log-record";

const LEVEL_COLORS: Record<LineLevel, ColorFunction> = {
  fatal: colors.red,
  error: colors.red,
  warn: colors.yellow,
  info: colors.cyan,
  debug: colors.gray,
  trace: colors.gray,
};

const SHORT_ID_LENGTH = 8;

function clock(time: Date) {
  return time.toTimeString().slice(0, 8);
}

function prettyValue(key: string, value: unknown) {
  if (key === "durationMs" && typeof value === "number") return `${Math.round(value)}ms`;
  if (key === "requestId" && typeof value === "string") return value.slice(0, SHORT_ID_LENGTH);
  if (typeof value === "string") return /\s/.test(value) ? JSON.stringify(value) : value;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function shownInMessage(msg: string, key: string, value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return false;

  const shown = prettyValue(key, value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(?<![\\w.-])${shown}(?![\\w.-])`).test(msg);
}

function prettyFields(record: LogRecord) {
  return Object.entries({ ...record.fields, ...record.context })
    .filter(([key, value]) => key !== "hint" && value !== undefined && !shownInMessage(record.msg, key, value))
    .map(([key, value]) => `${key === "requestId" ? "req" : key}=${prettyValue(key, value)}`)
    .join(" ");
}

function causeChain(err: SerializedError) {
  const chain: (SerializedError | string)[] = [];

  for (let cause = err.cause; cause !== undefined; cause = typeof cause === "string" ? undefined : cause.cause) chain.push(cause);

  return chain;
}

function causeLines(cause: SerializedError | string) {
  return `Caused by: ${typeof cause === "string" ? cause : (cause.stack ?? `${cause.name}: ${cause.message}`)}`;
}

function errorBlock(record: LogRecord) {
  if (!record.err || (record.level !== "fatal" && record.level !== "error")) return "";

  return `\n${[record.err.stack ?? record.err.message, ...causeChain(record.err).map(causeLines)].join("\n")}`;
}

function errorInline(record: LogRecord) {
  if (!record.err || record.level === "fatal" || record.level === "error") return "";

  const innermost = causeChain(record.err).at(-1);
  const cause = innermost === undefined ? "" : ` cause=${JSON.stringify(typeof innermost === "string" ? innermost : innermost.message || innermost.detail || "")}`;

  return ` ${colors.dim(`err=${JSON.stringify(record.err.message)}${cause}`)}`;
}

function hintLine(record: LogRecord) {
  const hint = record.fields?.hint;

  return typeof hint === "string" ? `\n  ${colors.yellow(`→ ${hint}`)}` : "";
}

export function prettyLine(record: LogRecord) {
  const level = LEVEL_COLORS[record.level](record.level.toUpperCase().padEnd(5));
  const tag = record.tag ? ` ${colors.bold(record.tag)}` : "";
  const fields = prettyFields(record);

  return `${colors.dim(clock(record.time))} ${level}${tag}  ${record.msg}${fields ? `  ${colors.dim(fields)}` : ""}${errorInline(record)}${hintLine(record)}${errorBlock(record)}`;
}

export function writePrettyLine(record: LogRecord) {
  outputStream(record.level).write(`${prettyLine(record)}\n`);
}
