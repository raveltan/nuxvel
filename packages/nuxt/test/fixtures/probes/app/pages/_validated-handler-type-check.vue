<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

async function publish() {
  const post = await $fetch("/api/_validated/hello", { method: "POST", query: { draft: "true" }, body: { title: "Hello" } });
  const title: string = post.title;
  const titleIsTyped: IsAny<typeof post.title> extends true ? never : true = true;

  return { title, titleIsTyped };
}

function publishWithoutTitle() {
  // @ts-expect-error the body schema requires a title
  return $fetch("/api/_validated/hello", { method: "POST", body: { tags: [] } });
}

function publishWithWrongQuery() {
  // @ts-expect-error draft is a string in the query
  return $fetch("/api/_validated/hello", { method: "POST", query: { draft: 1 }, body: { title: "Hello" } });
}

function fetchAnUnvalidatedRoute() {
  return $fetch("/api/_shared-schema-check", { query: { anything: 1 } });
}
</script>

<template>
  <button type="button" @click="publish">Publish</button>
  <button type="button" @click="publishWithoutTitle">Publish without title</button>
  <button type="button" @click="publishWithWrongQuery">Publish with wrong query</button>
  <button type="button" @click="fetchAnUnvalidatedRoute">Unvalidated</button>
</template>
