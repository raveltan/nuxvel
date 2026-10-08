import { z } from "zod";
import { signedReadUrl } from "@nuxvel/nuxt/server/storage";

const query = z.object({ key: z.string() });

export default defineEventHandler(async (event) => ({ url: await signedReadUrl(query.parse(getQuery(event)).key) }));
