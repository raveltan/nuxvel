export default defineEventHandler((event) => {
  if (!event.path.startsWith("/api/trpc/") || !getHeader(event, "x-probe-context-fail")) return;

  // trpc-nuxt reads the cached event.headers; only createContext reads the raw node headers after this
  void event.headers;
  Object.defineProperty(event.node.req.headers, "origin", {
    enumerable: true,
    get() {
      throw new Error("context exploded");
    },
  });
});
