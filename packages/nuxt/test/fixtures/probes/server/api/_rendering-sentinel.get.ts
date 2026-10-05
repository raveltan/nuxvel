export default defineEventHandler((event) => {
  recordRenderingSentinel(String(getQuery(event).mode));

  return null;
});
