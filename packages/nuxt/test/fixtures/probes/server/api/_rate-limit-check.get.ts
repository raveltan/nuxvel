import { setTimeout as sleep } from "node:timers/promises";

async function attempt(key: string) {
  try {
    await rateLimiter("_probe").consume(key);
    return "allowed";
  } catch (error) {
    return error instanceof RateLimitedError ? "rejected" : "error";
  }
}

export default defineEventHandler(async () => {
  const withinWindow = [];
  for (let i = 0; i < 4; i++) withinWindow.push(await attempt("a"));

  const otherKey = await attempt("b");

  await sleep(1100);

  const afterWindow = await attempt("a");

  return { withinWindow, otherKey, afterWindow };
});
