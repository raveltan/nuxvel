/**
 * The environment variable that gives a Nitro server a role besides
 * serving requests: `worker` makes it also run the queue worker, what
 * `nuxvel queue:work` starts, and what `nuxvel dev` sets on `nuxt dev`.
 *
 * @example
 * ```sh
 * NUXVEL_ROLE=worker node .output/server/index.mjs
 * ```
 */
export const ROLE_ENV = "NUXVEL_ROLE";

/**
 * The environment variable with how many jobs a worker runs at once;
 * 5 when unset.
 */
export const WORKER_CONCURRENCY_ENV = "NUXVEL_WORKER_CONCURRENCY";

/**
 * The environment variable with the comma-separated queues a worker
 * runs, such as `mail,default`; every queue a job uses when unset.
 * `nuxvel queue:work --queue` sets it.
 */
export const WORKER_QUEUES_ENV = "NUXVEL_WORKER_QUEUES";

export const DEFAULT_WORKER_CONCURRENCY = 5;
