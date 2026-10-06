import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { ActionError, mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import PostEditForm from "./PostEditForm.vue";

const now = new Date();
const post = { id: 1, title: "Hello", body: " ", authorId: "user-1", createdAt: now, updatedAt: now, deletedAt: null };
const meta = { component: PostEditForm, args: { post } } satisfies Meta<typeof PostEditForm>;
export default meta;

export const BodyEmpty: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        post: {
          update: () => {
            throw new ActionError("post.body-empty", "Body cannot be empty after trimming", "posts.update-post", "body");
          },
        },
      }),
    ],
  },
  play: async () => {
    await field(page, "Title").fill("Hello again");
    await button(page, "Save post").click();
    await expect(text(page, "Body cannot be empty after trimming")).toBeVisible();
    await expect(field(page, "Body")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "Title")).toHaveValue("Hello again");
  },
};

const update = trpcSpy("post.update", (input) => ({ ...post, ...input }));

export const Saves: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { update } })] },
  play: async () => {
    await expect(update).not.toHaveBeenCalled();
    await field(page, "Title").fill("Hello again");
    await field(page, "Body").fill("New body");
    await button(page, "Save post").click();
    await expect(update).toHaveBeenCalledWith({ id: 1, title: "Hello again", body: "New body" });
    await expect(update).toHaveBeenCalledTimes(1);
  },
};

const rejected = trpcSpy("post.update", (input) => ({ ...post, ...input }));

export const RequiresTitle: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { update: rejected } })] },
  play: async () => {
    await field(page, "Title").clear();
    await button(page, "Save post").click();
    await expect(field(page, "Title")).toHaveAttribute("aria-invalid", "true");
    await expect(rejected).not.toHaveBeenCalled();
  },
};
