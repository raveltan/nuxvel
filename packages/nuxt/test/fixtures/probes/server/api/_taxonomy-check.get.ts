import { TRPCError } from "@trpc/server";

const errorNames = [
  "NotFoundError",
  "ConflictError",
  "RateLimitedError",
  "TransientError",
  "UnknownError",
] as const;

export default defineEventHandler(async () => {
  const caller = useCaller();
  const codes: Record<string, string> = {};

  for (const name of errorNames) {
    try {
      await caller._taxonomyCheck.throwError(name);
      codes[name] = "NO_ERROR_THROWN";
    } catch (error) {
      codes[name] = error instanceof TRPCError ? error.code : "UNKNOWN";
    }
  }

  return codes;
});
