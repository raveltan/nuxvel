export default defineEventHandler((event) => provokeFailure(failureKindSchema.parse(getQuery(event)).kind));
