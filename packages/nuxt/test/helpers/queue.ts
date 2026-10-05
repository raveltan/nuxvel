import { Queue } from "bullmq";

export async function waitingJobNames() {
  const queue = new Queue("nuxvel", {
    connection: { url: process.env.NUXT_REDIS_URL, maxRetriesPerRequest: null },
  });

  try {
    const waiting = await queue.getWaiting();
    return waiting.map((job) => job.name);
  } finally {
    await queue.close();
  }
}
