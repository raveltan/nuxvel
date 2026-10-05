import { formatWithOptions } from "node:util";
import type { LogObject } from "consola/core";
import { migrationHint } from "../database/migration-hint";
import type { LogContext } from "./log-context";

export type LineLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface SerializedError {
  name: string;
  message: string;
  detail?: string;
  stack?: string;
  cause?: SerializedError | string;
}

export interface LogRecord {
  time: Date;
  level: LineLevel;
  tag: string;
  msg: string;
  fields: Record<string, unknown>;
  err?: SerializedError;
  context: LogContext;
}

const CONSOLA_KEYS = new Set(["date", "args", "type", "level", "tag"]);
const RESERVED_FIELDS = new Set(["time", "level", "tag", "msg", "err"]);
const MAX_CAUSE_DEPTH = 5;

function lineLevel(log: LogObject): LineLevel {
  if (log.level <= 0) return log.type === "fatal" ? "fatal" : "error";
  if (log.level === 1) return "warn";
  if (log.level <= 3) return "info";
  if (log.level === 4) return "debug";
  return "trace";
}

let everyLevelOnStderr = false;

export function logEveryLevelOnStderr() {
  everyLevelOnStderr = true;
}

export function outputStream(level: LineLevel) {
  if (everyLevelOnStderr) return process.stderr;

  return level === "info" || level === "debug" || level === "trace" ? process.stdout : process.stderr;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype === null || prototype === Object.prototype;
}

function emptyMessageDetail(error: Error) {
  if (error.message !== "") return undefined;

  const code = (error as { code?: unknown }).code;

  if (typeof code === "string" && code !== "") return code;

  const first = error instanceof AggregateError ? error.errors[0] : undefined;

  return first instanceof Error && first.message !== "" ? first.message : undefined;
}

export function serializedError(error: Error, depth = 0): SerializedError {
  const cause = error.cause;
  const detail = emptyMessageDetail(error);

  return {
    name: error.name,
    message: error.message,
    ...(detail === undefined ? {} : { detail }),
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(cause === undefined
      ? {}
      : { cause: cause instanceof Error && depth < MAX_CAUSE_DEPTH ? serializedError(cause, depth + 1) : String(cause) }),
  };
}

function addField(fields: Record<string, unknown>, key: string, value: unknown) {
  if (!RESERVED_FIELDS.has(key)) fields[key] = value;
}

export function logRecord(log: LogObject, context: LogContext): LogRecord {
  const fields: Record<string, unknown> = {};
  const parts: unknown[] = [];
  let err: SerializedError | undefined;
  let hint: string | undefined;

  for (const [key, value] of Object.entries(log)) {
    if (!CONSOLA_KEYS.has(key)) addField(fields, key, value);
  }

  for (const argument of log.args as unknown[]) {
    if (argument instanceof Error && err === undefined) {
      err = serializedError(argument);
      hint = migrationHint(argument);
    }
    else if (isPlainObject(argument)) for (const [key, value] of Object.entries(argument)) addField(fields, key, value);
    else parts.push(argument);
  }

  if (hint !== undefined) fields.hint = hint;

  const msg = parts.length === 0 ? "" : formatWithOptions({ colors: false, breakLength: Number.POSITIVE_INFINITY }, ...parts).trim();

  return {
    time: log.date,
    level: lineLevel(log),
    tag: log.tag,
    msg: msg || err?.message || "",
    fields,
    ...(err === undefined ? {} : { err }),
    context: Object.fromEntries(Object.entries(context).filter(([key]) => fields[key] === undefined)),
  };
}
