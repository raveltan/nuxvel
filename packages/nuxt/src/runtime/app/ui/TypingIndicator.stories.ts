import TypingIndicator from "./TypingIndicator.vue";

export default { title: "TypingIndicator", component: TypingIndicator };

const member = (name: string, typing: boolean) => ({ userId: name, name, state: { typing }, connections: 1 });

export const One = { args: { members: [member("Ada", true), member("Linus", false)] } };

export const Many = { args: { members: [member("Ada", true), member("Linus", true), member("Grace", true)] } };
