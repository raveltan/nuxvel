import { authInstance } from "../../../../../src/runtime/server/auth/instance";

export default defineEventHandler(async () => {
  const context = await authInstance().$context;
  context.runInBackground(Promise.reject(new Error("auth task rejected")));

  return { ran: true };
});
