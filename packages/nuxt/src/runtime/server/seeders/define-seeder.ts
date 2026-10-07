import { awaitingName } from "../discovery/definition-name";
import type { SeederName } from "./seeder-name";

/** What a {@link defineSeeder} handler gets. */
export interface SeederContext {
  /**
   * Runs the given seeders, in order, and waits for them. Each is a
   * {@link SeederName} or a seeder definition (`$seeders.tags` or an
   * import). A seeder that already ran in this `nuxvel db:seed` run does
   * not run again, so two seeders can both call the one they depend on.
   */
  call(...seeders: (SeederName | Seeder)[]): Promise<void>;
}

/** A seeder definition: the handler that fills the database. */
export interface Seeder {
  name: string;
  handler(context: SeederContext): Promise<void | readonly string[]>;
}

/**
 * Defines a seeder: code that fills the database with development or
 * demo data.
 *
 * `defineSeeder` is auto-imported. One seeder per file, under
 * `server/seeders/`; the file is discovered, so nothing registers it, and
 * its path is the seeder's name (`server/seeders/blog/posts.seeder.ts` is
 * `"blog.posts"`). `nuxvel db:seed` runs it, and so does
 * `call("blog.posts")` in another seeder.
 *
 * The handler runs in one transaction, and a throw rolls back all of its
 * writes. `useDb()` joins that transaction, and so do the factories from
 * `@nuxvel/nuxt/factories`. `systemActor("seed")` is the actor in scope,
 * so `audit()` and actions work without an actor option. After a run
 * commits a seeder, it forgets the whole app cache, as
 * `cacheForget("*")` does, so `remember()` values are not stale.
 *
 * The handler may return lines, such as how to sign in as the demo
 * user. `nuxvel db:seed` prints them under the seeder's name.
 *
 * @example
 * ```ts
 * // server/seeders/posts.seeder.ts
 * import { postFactory } from "../factories/posts.factory";
 * import { userFactory } from "../factories/users.factory";
 *
 * export const postsSeeder = defineSeeder(async ({ call }) => {
 *   await call("tags", $seeders.blog.categories);
 *
 *   const author = await userFactory({ email: "author@example.com" });
 *   await postFactory.for("authorId", author)({ title: "Hello" });
 *
 *   return [`Sign in as ${author.email}`];
 * });
 * ```
 */
export function defineSeeder(handler: (context: SeederContext) => Promise<void | readonly string[]>): Seeder {
  return awaitingName({ name: "", handler }, "seeder");
}
