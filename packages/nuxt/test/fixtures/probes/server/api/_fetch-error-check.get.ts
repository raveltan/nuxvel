import { z } from "zod";

const callUpstream = probeNamed("_fetch-error-check.callUpstream", defineAction({
  input: z.object({ url: z.string() }),
  transaction: false,
  handler: ({ url }) => $fetch<unknown>(url),
}));

async function classified(url: string) {
  try {
    await callUpstream({ url }, { actor: systemActor("_fetch-error-check") });
    return { code: "no error" };
  } catch (error) {
    if (isTaxonomyError(error, "TOO_MANY_REQUESTS")) return { code: error.code, retryAfter: error.retryAfter };

    return { code: isTaxonomyError(error, "SERVICE_UNAVAILABLE") ? error.code : "unclassified" };
  }
}

export default defineEventHandler(async () => {
  const upstream = (status: number) => `/api/_fetch-error-upstream?status=${status}`;

  return {
    network: await classified("http://127.0.0.1:1/unreachable"),
    timeout: await classified(upstream(408)),
    unavailable: await classified(upstream(503)),
    rateLimited: await classified(upstream(429)),
    notFound: await classified(upstream(404)),
  };
});
