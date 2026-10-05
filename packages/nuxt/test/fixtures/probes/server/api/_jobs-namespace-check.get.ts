export default defineEventHandler(() => ({
  record: $jobs._probe.record.name,
  namedExport: $jobs._probe.namedExport.name,
  nested: $jobs.post.notifyFollowers.name,
}));
