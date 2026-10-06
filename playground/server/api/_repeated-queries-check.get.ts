import { eq } from "drizzle-orm";
import { postsTable } from "#nuxvel/schema";

export default defineEventHandler(async (event) => {
  const { times, allowed } = getQuery(event);

  const selectEachPost = async () => {
    for (let id = 1; id <= Number(times ?? 5); id += 1) {
      await useDb().select().from(postsTable).where(eq(postsTable.id, id));
    }
  };

  if (allowed) await allowRepeatedQueries("the test repeats it on purpose", selectEachPost);
  else await selectEachPost();

  return { ok: true };
});
