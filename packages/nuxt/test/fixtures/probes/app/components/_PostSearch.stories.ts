import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import PostSearch from "./_PostSearch.vue";

export default { title: "Probes/PostSearch", component: PostSearch };

const list = trpcSpy("post.list", (input) => ({ rows: [], page: 1, perPage: 15, total: input?.q ? 1 : 0, lastPage: 1 }));

export const Debounces = {
  parameters: { msw: [mockTrpc({ post: { list } })] },
  play: async () => {
    await expect(list).toHaveBeenCalledWith({ q: "" });
    await field(page, "Search").pressSequentially("hello", { delay: 50 });
    await expect(list).toHaveBeenCalledWith({ q: "hello" });
    await expect(text(page, "1 posts")).toBeVisible();
    await expect(list).toHaveBeenCalledTimes(2);
  },
};
