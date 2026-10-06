import { type ComputedRef, computed, onMounted, onUnmounted, shallowRef, watch } from "vue";
import type { z } from "zod";
import type { Job, JobChannel } from "../../server/jobs/define-job";
import type { JobChannelName, JobMessage, JobResultMessage } from "../../server/jobs/registry";
import { jobChannelName } from "../../shared/realtime/job-channel";
import { subscribeToChannel } from "../realtime/channel-connection";
import { useUser } from "./use-user";

/**
 * Where the latest run that {@link useJobChannel} follows stands: `idle`
 * before any message, `running` after `started` or a `progress`, then
 * `completed` or `failed`.
 */
export type JobRunStatus = "idle" | "running" | "completed" | "failed";

type Following<Message extends JobResultMessage<unknown>> = {
  events: ComputedRef<readonly Message[]>;
  status: ComputedRef<JobRunStatus>;
  progress: ComputedRef<number | undefined>;
  result: ComputedRef<Extract<Message, { event: "completed" }>["payload"]["result"] | undefined>;
  error: ComputedRef<string | undefined>;
  close: () => void;
};

/**
 * Follows the runs of a job from a component: its `reportProgress`
 * reports, then `completed` or `failed`. The job is its name or its entry
 * in the auto-imported `$jobs` namespace (`$jobs.post.import`), which in
 * the app holds only the name.
 *
 * Auto-imported. Listens to the signed-in user's channel of the job,
 * `job:<name>:<userId>`, so it receives only the runs that user
 * dispatched. Signed out, it listens to `job:<name>`, which carries the
 * runs with no user behind them. It waits for the session before it
 * subscribes. It listens the way `useChannel()` does — joined on mount over the tab's shared
 * connection, left on unmount, nothing during SSR — and collects each
 * {@link JobMessage} in `events`, oldest first, typed: `completed`
 * carries the handler's return value. Only the newest `limit` messages
 * are kept. `status`, `progress`, `result` and `error` read the newest
 * message, so they describe the latest run: `progress` is the last
 * reported percentage (100 once it completed), `result` the handler's return
 * value once it completed, `error` the message of a failed run, each
 * `undefined` otherwise. Each run broadcasts `started` first, so a new
 * run starts over at `running` with no `progress`, `result` or `error`. Only a job
 * whose `defineJob` has a `channel` can be followed, and its `authorize`
 * decides who may listen.
 *
 * @param name The job's `name`, or its `$jobs` entry.
 * @param options.limit How many of the newest messages `events` keeps;
 * older ones are dropped. Defaults to 100.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { status, progress, result, error } = useJobChannel("post.import");
 * </script>
 *
 * <template>
 *   <UProgress v-if="status === 'running'" :model-value="progress" />
 *   <p v-else-if="result">Imported {{ result.count }} posts</p>
 *   <UAlert v-else-if="error" color="error" :title="error" />
 * </template>
 * ```
 */
export function useJobChannel<Name extends JobChannelName>(
  name: Name,
  options?: { limit?: number },
): Following<JobMessage<Name>>;
export function useJobChannel<Result>(
  job: Job<string, z.ZodType, Result> & { channel: JobChannel },
  options?: { limit?: number },
): Following<JobResultMessage<Result>>;
export function useJobChannel(job: string | Job, { limit = 100 }: { limit?: number } = {}): Following<JobResultMessage<unknown>> {
  const name = typeof job === "string" ? job : job.name;
  const { user, isPending } = useUser();
  const events = shallowRef<readonly JobResultMessage<unknown>[]>([]);
  let unsubscribe: (() => void) | undefined;
  let stopWatching: (() => void) | undefined;

  function listen(channel: string | undefined) {
    unsubscribe?.();
    unsubscribe = channel
      ? subscribeToChannel(channel, (message) => {
          // the job's run broadcasts only these messages
          events.value = [...events.value, message as JobResultMessage<unknown>].slice(-limit);
        })
      : undefined;
  }

  function close() {
    stopWatching?.();
    stopWatching = undefined;
    listen(undefined);
  }

  onMounted(() => {
    stopWatching = watch(() => (isPending.value ? undefined : jobChannelName(name, user.value?.id)), listen, {
      immediate: true,
    });
  });

  onUnmounted(close);

  const latest = computed(() => events.value.at(-1));

  return {
    events: computed(() => events.value),
    status: computed(() => (latest.value === undefined ? "idle" : latest.value.event === "started" || latest.value.event === "progress" ? "running" : latest.value.event)),
    progress: computed(() => {
      if (latest.value?.event === "completed") return 100;

      const reported = events.value.findLast((message) => message.event === "progress" || message.event === "started");

      return reported?.event === "progress" ? reported.payload.percent : undefined;
    }),
    result: computed(() => (latest.value?.event === "completed" ? latest.value.payload.result : undefined)),
    error: computed(() => (latest.value?.event === "failed" ? latest.value.payload.message : undefined)),
    close,
  };
}
