import { postsTable } from "~~/server/database/schema/posts.schema";

export default defineEventHandler(async () => (await useDb().select().from(postsTable)).map(({ title }) => title));
