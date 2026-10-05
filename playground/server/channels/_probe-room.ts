export default defineChannel({
  events: {},
  authorize: ({ params }) => params.id === "1",
  presence: true,
});
