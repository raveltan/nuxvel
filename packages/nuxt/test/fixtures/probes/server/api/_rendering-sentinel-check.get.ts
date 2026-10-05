export default defineEventHandler((event) => ({
  hits: renderingSentinelHits(String(getQuery(event).mode)),
}));
