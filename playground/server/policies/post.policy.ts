import { and, eq, inArray } from "drizzle-orm";
import { userTable } from "../database/schema/auth.schema";
import { postsTable } from "../database/schema/posts.schema";

async function adminAuthors(actor: { role?: string }, rows: { authorId: string }[]) {
  if (actor.role !== "admin") return new Set<string>();

  const admins = await useDb()
    .select({ id: userTable.id })
    .from(userTable)
    .where(and(inArray(userTable.id, rows.map((row) => row.authorId)), eq(userTable.role, "admin")));

  return new Set(admins.map((admin) => admin.id));
}

function mayEdit(
  actor: { id: string; role?: string },
  post: { authorId: string },
  preloaded: { adminAuthors: Set<string> },
) {
  return post.authorId === actor.id || (actor.role === "admin" && !preloaded.adminAuthors.has(post.authorId));
}

export const postPolicy = definePolicy(postsTable, {
  preload: async (actor, rows) => ({ adminAuthors: await adminAuthors(actor, rows) }),
  rules: {
    update: mayEdit,
    delete: mayEdit,
    restore: mayEdit,
  },
});
