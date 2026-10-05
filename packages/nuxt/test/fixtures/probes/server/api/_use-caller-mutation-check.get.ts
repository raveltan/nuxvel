import { TRPCError } from "@trpc/server";

export default defineEventHandler(async () => {
  try {
    return { echoed: await useCaller().health.echo("hello") };
  } catch (error) {
    return { code: error instanceof TRPCError ? error.code : "UNKNOWN" };
  }
});
