import SafeHtml from "./SafeHtml.vue";

export default { title: "SafeHtml", component: SafeHtml };

export const Default = { args: { html: "<p>Sanitized <strong>rich</strong> text with a <a href=\"https://nuxt.com\">link</a>.</p>" } };
