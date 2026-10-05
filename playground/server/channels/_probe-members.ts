export default defineChannel({
  events: {},
  authorize: ({ user }) => user !== null,
});
