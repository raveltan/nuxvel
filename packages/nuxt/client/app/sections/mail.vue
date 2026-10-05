<script setup lang="ts">
import type { MailSectionData } from "../../../src/runtime/shared/devtools/sections/mail";

const props = defineProps<{ data: MailSectionData }>();

const previewUrl = `${useRuntimeConfig().app.baseURL}api/mail-preview`;
const selected = ref(props.data.previews[0]?.name ?? "");
const input = ref("");
const preview = ref<{ subject: string; html: string } | null>(null);
const previewError = ref<string | null>(null);

watch(
  selected,
  (name) => {
    const sample = props.data.previews.find((candidate) => candidate.name === name)?.sample;

    input.value = JSON.stringify(sample ?? {}, null, 2);
    preview.value = null;
    previewError.value = null;
  },
  { immediate: true },
);

async function renderPreview() {
  previewError.value = null;

  try {
    const response = await fetch(previewUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: selected.value, input: JSON.parse(input.value) }),
    });
    const body = await response.json();

    if (!response.ok) throw new Error(body.message ?? response.statusText);

    preview.value = body;
  } catch (error) {
    preview.value = null;
    previewError.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <div class="flex flex-col gap4">
    <div class="flex items-center justify-between">
      <span class="op50">{{ data.sent.total }} in Mailpit</span>
      <a class="n-link n-link-base" :href="data.mailpitUrl" target="_blank" rel="noopener">Open Mailpit</a>
    </div>
    <NTip v-if="data.sent.error" n="orange" icon="carbon-warning-alt">
      Could not read Mailpit at {{ data.mailpitUrl }}: {{ data.sent.error }}. Set NUXT_MAILPIT_URL if it runs elsewhere.
    </NTip>
    <table v-else class="w-full text-sm">
      <thead>
        <tr>
          <th v-for="heading in ['Sent at', 'To', 'Subject', '']" :key="heading" class="px2 py1 text-left font-normal op50">
            {{ heading }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="message in data.sent.messages" :key="message.id" data-mail-message class="border-t border-base">
          <td class="px2 py1 font-mono">
            {{ message.sentAt }}
          </td>
          <td class="px2 py1 font-mono">
            {{ message.to.join(", ") }}
          </td>
          <td class="px2 py1" :title="message.snippet">
            {{ message.subject }}
          </td>
          <td class="px2 py1">
            <a class="n-link n-link-base" :href="message.url" target="_blank" rel="noopener">Open</a>
          </td>
        </tr>
        <tr v-if="!data.sent.messages.length">
          <td colspan="4" class="px2 py1 op50">
            None yet
          </td>
        </tr>
      </tbody>
    </table>

    <form v-if="data.previews.length" class="flex flex-col gap2" @submit.prevent="renderPreview">
      <div class="flex items-center gap2">
        <label for="mail-preview-name" class="op50">Preview with sample input</label>
        <select id="mail-preview-name" v-model="selected" class="n-bg-base border border-base rounded px2 py1">
          <option v-for="mail in data.previews" :key="mail.name" :value="mail.name">
            {{ mail.name }}
          </option>
        </select>
        <NButton type="submit">
          Preview
        </NButton>
      </div>
      <label for="mail-preview-input" class="sr-only">Input</label>
      <textarea
        id="mail-preview-input"
        v-model="input"
        rows="6"
        class="n-bg-base border border-base rounded p2 font-mono text-sm"
      />
      <NTip v-if="previewError" n="red" icon="carbon-warning-alt">
        {{ previewError }}
      </NTip>
      <div v-if="preview" class="flex flex-col gap2">
        <div><span class="op50">Subject</span> {{ preview.subject }}</div>
        <iframe
          sandbox=""
          title="Mail preview"
          :srcdoc="preview.html"
          class="h-80 w-full border border-base rounded bg-white"
        />
      </div>
    </form>
  </div>
</template>
