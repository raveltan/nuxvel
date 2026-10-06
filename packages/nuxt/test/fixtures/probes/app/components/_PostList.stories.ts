import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, page, text } from "@nuxvel/nuxt/storybook/test";
import PostList from "./_PostList.vue";

export default { title: "Probes/PostList", component: PostList };

const now = new Date();
const rows = [{ id: 1, title: "Hello", body: "Body", authorId: "user-1", createdAt: now, updatedAt: now, deletedAt: null }];
const list = trpcSpy("post.list", () => ({ rows, page: 1, perPage: 15, total: rows.length, lastPage: 1 }));
const remove = trpcSpy("post.delete", (input) => input);

export const RefetchesAfterDelete = {
  parameters: { msw: [mockTrpc({ post: { list, delete: remove } })] },
  play: async () => {
    await expect(text(page, "Hello")).toBeVisible();
    await expect(list).toHaveBeenCalledTimes(1);
    await button(page, "Delete Hello").click();
    await expect(remove).toHaveBeenCalledWith({ id: 1 });
    await expect(list).toHaveBeenCalledTimes(2);
  },
};
