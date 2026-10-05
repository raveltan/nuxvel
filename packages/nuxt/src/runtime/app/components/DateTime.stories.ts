import DateTime from "./DateTime.vue";

export default { title: "DateTime", component: DateTime };

export const Absolute = { args: { value: "2026-01-02T03:04:05Z" } };

export const Relative = { args: { value: Date.now() - 5 * 60 * 1000, relative: true } };
