export default defineChannel({
  events: {},
  authorize: ({ user }) => user?.role === "admin",
});
