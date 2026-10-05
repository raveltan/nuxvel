<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const route = useRoute();
const id = Number(route.params.id);
const post = useQuery(useTRPC().post.byId.queryOptions({ id }));
const { user } = useUser();
const { members, setState } = usePresence("posts", { id });
const others = computed(() => members.value.filter((member) => member.userId !== user.value?.id));
</script>

<template>
  <div class="max-w-xl space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Edit post</h1>
      <PresenceAvatars :members="others" />
    </div>
    <QueryState :query="post">
      <template #default="{ data }">
        <div @input="setState({ typing: true })" @focusout="setState({ typing: false })">
          <PostEditForm :post="data" />
        </div>
      </template>
    </QueryState>
    <TypingIndicator :members="others" />
  </div>
</template>
