import { type LogRecord, outputStream, serializedError } from "./log-record";

function jsonSafe() {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown) => {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Error) return serializedError(value);
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }

    return value;
  };
}

function jsonLine(record: LogRecord) {
  return JSON.stringify(
    {
      time: record.time.toISOString(),
      level: record.level,
      ...(record.tag ? { tag: record.tag } : {}),
      msg: record.msg,
      ...record.fields,
      ...(record.err === undefined ? {} : { err: record.err }),
      ...record.context,
    },
    jsonSafe(),
  );
}

export function writeJsonLine(record: LogRecord) {
  outputStream(record.level).write(`${jsonLine(record)}\n`);
}
