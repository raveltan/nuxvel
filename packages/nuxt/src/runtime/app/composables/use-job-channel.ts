import { type ComputedRef, computed, onMounted, onUnmounted, shallowRef, watch } from "vue";
import type { z } from "zod";
import type { Job, JobChannel } from "../../server/jobs/define-job";
import type { JobChannelName, JobMessage, JobResultMessage } from "../../server/jobs/registry";
import { jobChannelName } from "../../shared/realtime/job-channel";
import { subscribeToChannel } from "../realtime/channel-connection";
import { useUser } from "./use-user";

type Following<Message> = { events: ComputedRef<readonly Message[]>; close: () => void };

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
 * are kept. Only a job whose `defineJob` has
 * a `channel` can be followed, and its `authorize` decides who may
 * listen.
 *
 * @param name The job's `name`, or its `$jobs` entry.
 * @param options.limit How many of the newest messages `events` keeps;
 * older ones are dropped. Defaults to 100.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { events } = useJobChannel("post.import");
 * const latest = computed(() => events.value.at(-1));
 * </script>
 *
 * <template>
 *   <p v-if="latest?.event === 'progress'">{{ latest.payload.percent }}%</p>
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
export function useJobChannel(job: string | Job, { limit = 100 }: { limit?: number } = {}): Following<unknown> {
  const name = typeof job === "string" ? job : job.name;
  const { user, isPending } = useUser();
  const events = shallowRef<readonly unknown[]>([]);
  let unsubscribe: (() => void) | undefined;
  let stopWatching: (() => void) | undefined;

  function listen(channel: string | undefined) {
    unsubscribe?.();
    unsubscribe = channel
      ? subscribeToChannel(channel, (message) => {
          events.value = [...events.value, message].slice(-limit);
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

  return { events: computed(() => events.value), close };
}
