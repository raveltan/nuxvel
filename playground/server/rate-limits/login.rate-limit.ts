export const loginRateLimit = defineRateLimit({ points: 4, window: { minutes: 1 } });
