export default defineEventHandler(() => ({
  queue: useRedis("queue").options.db,
  cache: useRedis("cache").options.db,
  pubsub: useRedis("pubsub").options.db,
  durable: useRedis("durable").options.db,
}));
