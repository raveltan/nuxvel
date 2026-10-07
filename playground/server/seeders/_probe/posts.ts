import { eq } from "drizzle-orm";
import * as $seeders from "#nuxvel/seeders-namespace";
import { userTable } from "#nuxvel/schema";
import { postsTable } from "#nuxvel/schema";
import { postFactory } from "#nuxvel/factories";

export default defineSeeder(async ({ call }) => {
  await call("_probe.author", $seeders._probe.author);

  const author = await useDb()
    .select()
    .from(userTable)
    .where(eq(userTable.email, "seeded-author@example.com"))
    .then(firstOrFail);

  await postFactory.for("authorId", author)({ title: "Seeded by a factory" });

  const post = await useDb()
    .insert(postsTable)
    .values({ title: "Seeded by useDb", body: "", authorId: author.id })
    .returning()
    .then(firstOrFail);

  await audit("post.seeded", { type: "posts", id: post.id });
});
