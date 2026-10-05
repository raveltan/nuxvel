const LOCK_NOT_AVAILABLE = "55P03";

export function lockTimeoutError(error: unknown): Error | undefined {
  if (!(error instanceof Error)) return undefined;
  if ("code" in error && error.code === LOCK_NOT_AVAILABLE) return error;

  return lockTimeoutError(error.cause);
}
