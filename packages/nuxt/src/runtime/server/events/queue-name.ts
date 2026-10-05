const LISTENER_JOB_PREFIX = "listener:";

/** The queue job name a queued listener's work is enqueued under. */
export function listenerJobName(name: string) {
  return `${LISTENER_JOB_PREFIX}${name}`;
}
