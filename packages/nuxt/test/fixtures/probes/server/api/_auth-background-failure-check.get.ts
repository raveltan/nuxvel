import { authInstance } from "../../../../../src/runtime/server/auth/instance";

export default defineEventHandler(async () => {
  const context = await authInstance().$context;
  await context.runInBackgroundOrAwait(Promise.reject(new Error("auth mail exploded")));

  return { ran: true };
});
