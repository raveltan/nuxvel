import type { LogLevel } from "better-auth";
import { reportError } from "../error-tracking/sentry";
import { useLogger } from "../logging/logger";
import { currentRequestId } from "../trpc/context";

export const logAuth = (level: Exclude<LogLevel, "success">, message: string, ...args: unknown[]): void => {
  useLogger("auth")[level](message, ...args);

  const error = args.find((arg) => arg instanceof Error);
  if (level === "error" && error) reportError(error, { requestId: currentRequestId() });
};
