import { defineNitroPlugin } from "nitropack/runtime";
import { onCommit } from "../database/transaction";
import { installEffectReplacements } from "../effects/replacements";
import { fromJobPayload } from "../jobs/payload";
import { subscribeObserved } from "../observe/channels";
import { installFetchFake } from "./fetch-fake";
import { holdQueuedJob } from "./queued-jobs";
import { fakeStripeFetch } from "./stripe/router";
import { recordedEffects } from "./recorders";

export default defineNitroPlugin((nitro) => {
  const recorded = recordedEffects();

  installEffectReplacements({
    enqueue: (job) => {
      if (holdQueuedJob(job)) recorded.queued.push({ name: job.name, payload: fromJobPayload(job.payload).payload });
    },
    deliverPush: (endpoint, payload) => {
      if (recorded.goneEndpoints.includes(endpoint)) return 410;

      recorded.pushes.push({ endpoint, notification: JSON.parse(payload) });

      return 201;
    },
    stripeFetch: fakeStripeFetch(recorded.fetched),
  });

  const unsubscribes = [
    installFetchFake(recorded.fetched),
    subscribeObserved("job:dispatch", (call) => recorded.dispatched.push(call)),
    subscribeObserved("event:emit", (event) => void onCommit(() => void recorded.emitted.push(event))),
    subscribeObserved("listener:run", (run) => recorded.listenerRuns.push(run)),
    subscribeObserved("mail:send", (mail) => recorded.sent.push(mail)),
    subscribeObserved("notification:send", (notification) => recorded.notified.push(notification)),
    subscribeObserved("policy:decision", (decision) => recorded.policyDecisions.push(decision)),
    subscribeObserved("action:call", (call) => recorded.actionCalls.push(call)),
    subscribeObserved("realtime:broadcast", (broadcast) => recorded.broadcasts.push(broadcast)),
    subscribeObserved("cache:lookup", (lookup) => recorded.cacheLookups.push(lookup)),
    subscribeObserved("error", (error) => recorded.errors.push(error)),
    subscribeObserved("log", (line) => recorded.logs.push(line)),
  ];

  nitro.hooks.hook("close", () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  });
});
