const JOB_CHANNEL_PREFIX = "job:";

/**
 * The channel a job with a `channel` option broadcasts a run on:
 * `job:<name>:<userId>` for a run a user dispatched, `job:<name>` for a
 * run with no user behind it.
 */
export function jobChannelName(job: string, userId?: string) {
  return userId === undefined ? `${JOB_CHANNEL_PREFIX}${job}` : `${JOB_CHANNEL_PREFIX}${job}:${userId}`;
}

/** The job and the user behind a job channel's name, or `undefined` for any other channel. */
export function jobFromChannelName(channel: string) {
  if (!channel.startsWith(JOB_CHANNEL_PREFIX)) return undefined;

  const rest = channel.slice(JOB_CHANNEL_PREFIX.length);
  const colon = rest.indexOf(":");

  return colon === -1 ? { job: rest } : { job: rest.slice(0, colon), userId: rest.slice(colon + 1) };
}
