import type { TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";
import { reportError } from "../error-tracking/sentry";
import { useLogger } from "../logging/logger";
import { isMaintenanceError } from "../maintenance/maintenance-error";
import { currentRequestId } from "./context";
import { isRemovedProcedure } from "./error-formatter";
import { failureDetails } from "./failure-details";

const CLIENT_ERROR_CODES = new Set<TRPC_ERROR_CODE_KEY>([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "UNPROCESSABLE_CONTENT",
]);

function warnClientError(error: TRPCError, path: string | undefined) {
  const { message, fields } = failureDetails(error);

  useLogger("trpc").warn(`${path ?? "a procedure"} failed: ${message}`, {
    procedure: path,
    code: error.code,
    ...(fields ? { fields } : {}),
  });
}

export function reportUnexpectedError({ error, path }: { error: TRPCError; path?: string }) {
  const cause = error.cause ?? error;
  const message = `${path ?? "a procedure"} failed`;

  if (import.meta.dev && CLIENT_ERROR_CODES.has(error.code) && !isRemovedProcedure(error)) {
    warnClientError(error, path);
    return;
  }

  if (error.code === "SERVICE_UNAVAILABLE" && !isMaintenanceError(error)) {
    useLogger("trpc").warn(message, cause, { procedure: path });
    return;
  }

  if (error.code !== "INTERNAL_SERVER_ERROR") return;

  useLogger("trpc").error(message, cause, { procedure: path });
  reportError(cause, { requestId: currentRequestId(), procedure: path });
}
