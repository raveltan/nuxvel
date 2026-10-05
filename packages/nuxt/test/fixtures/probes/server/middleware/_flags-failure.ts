export default defineEventHandler((event) => {
  if (event.path === "/api/flags" && getHeader(event, "x-probe-flags-fail")) {
    throw createError({ statusCode: 500, statusMessage: "flags probe failure" });
  }
});
