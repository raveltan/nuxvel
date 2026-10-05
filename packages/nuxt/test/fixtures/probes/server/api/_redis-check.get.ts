export default defineEventHandler(async () => {
  const queue = useRedis("queue");
  const cache = useRedis("cache");

  return {
    sameInstancePerPurpose: useRedis("queue") === queue,
    distinctInstancePerPurpose: queue !== cache,
    pong: await queue.ping(),
  };
});
