import { z } from "zod";

const query = z.object({ key: z.string() });

export default defineEventHandler(async (event) => ({ url: await signedReadUrl(query.parse(getQuery(event)).key) }));
