import type { TRPCError } from "@trpc/server";
import { z } from "zod";
import { errorFields } from "./error-extras";

export function failureDetails(error: TRPCError) {
  const fields = errorFields(error);

  return {
    message: error.cause instanceof z.core.$ZodError ? "Invalid input" : error.message,
    ...(fields ? { fields } : {}),
  };
}
