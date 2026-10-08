import { clientIp } from "@nuxvel/nuxt/server/security";

export default defineEventHandler((event) => ({ clientIp: clientIp(event) ?? null }));
