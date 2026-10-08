import { postsTable } from "~~/server/database/schema/posts.schema";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => (await useDb().select().from(postsTable)).map(({ title }) => title));
