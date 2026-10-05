import { defineEventHandler } from "h3";
import { useStorage } from "nitropack/runtime";
import { settleAfterResponse } from "../../auth/after-response";
import { forgetStoredCache } from "../../cache/cache";
import { forgetRateLimits } from "../../security/sliding-window";
import { setTestClock } from "../../clock/now";
import { setFakeResponses } from "../fetch-fake";
import { dropQueuedJobs } from "../queued-jobs";
import { resetRecordedEffects } from "../recorders";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { resetFakeStripe } from "../stripe/state";

export default defineEventHandler(async () => {
  refuseOutsideVitest();

  await settleAfterResponse();
  resetRecordedEffects();
  dropQueuedJobs();
  setTestClock(undefined);
  setFakeResponses(undefined);
  resetFakeStripe();
  await forgetStoredCache();
  // clear() leaves the entries of the memory driver in place
  const routeCache = useStorage("cache");
  await Promise.all((await routeCache.getKeys()).map((key) => routeCache.removeItem(key)));
  await forgetRateLimits();

  return { ok: true };
});
