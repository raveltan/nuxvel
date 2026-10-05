import PresenceAvatars from "./PresenceAvatars.vue";

export default { title: "PresenceAvatars", component: PresenceAvatars };

const member = (name: string) => ({ userId: name, name, state: {}, connections: 1 });

export const Default = { args: { members: ["Ada Lovelace", "Linus Torvalds", "Grace Hopper"].map(member) } };

export const Overflow = { args: { max: 2, members: ["Ada Lovelace", "Linus Torvalds", "Grace Hopper", "Alan Turing"].map(member) } };
