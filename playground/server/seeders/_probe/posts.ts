import { eq } from "drizzle-orm";
import { userTable } from "../../database/schema/auth.schema";
import { postsTable } from "../../database/schema/posts.schema";
import { postFactory } from "../../factories/posts.factory";

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
