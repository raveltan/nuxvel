import { describe, it } from "vitest";

import { expect, expectConstantQueries, guest } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("loader()", async () => {
  await setupPlayground();

  it("runs the loads of one request as one query", async () => {
    let answers: unknown[] = [];
    let expected: unknown[] = [];

    const queries = await expectConstantQueries(async (size) => {
      const rows = await Promise.all(
        Array.from({ length: size }, async (_, index) => {
          const author = await userFactory({ name: `Author ${index}` });

          return { id: (await postFactory.for("authorId", author)()).id, author: author.name };
        }),
      );

      expected = rows.toSorted((a, b) => a.id - b.id);
      answers = await guest().trpc.post.withAuthors({ ids: rows.map((row) => row.id) });
    }, [1, 10]);

    expect(queries).toBe(2);
    expect(answers).toEqual(expected);
  });
});
