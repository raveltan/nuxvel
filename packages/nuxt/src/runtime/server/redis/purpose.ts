/** What a Redis connection is used for, one connection per purpose. */
export type RedisPurpose = "queue" | "cache" | "pubsub" | "durable";
