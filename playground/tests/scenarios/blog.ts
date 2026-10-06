import { postFactory } from "#nuxvel/factories";
import { userFactory } from "#nuxvel/factories";

export async function blog({ posts = 1 }: { posts?: number } = {}) {
  const author = await userFactory();
  const written = [];

  for (let n = 0; n < posts; n++) written.push(await postFactory.for("authorId", author)({ title: `Post ${n + 1}` }));

  return { author, posts: written };
}
