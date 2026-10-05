export const LOG_LEVELS = ["silent", "fatal", "error", "warn", "info", "debug", "trace"] as const;

export const LOG_FORMATS = ["pretty", "json"] as const;

export type LogLevelName = (typeof LOG_LEVELS)[number];

export type LogFormat = (typeof LOG_FORMATS)[number];
