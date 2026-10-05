import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { status } = await getValidatedQuery(event, z.object({ status: z.coerce.number() }).parse);

  if (status === 429) setResponseHeader(event, "retry-after", 7);
  setResponseStatus(event, status);

  return { status };
});
