import { loginRateLimit } from "#server/rate-limits/login.rate-limit";
import authorSeeder from "#server/seeders/_probe/author";
import { defineSeeder } from "@nuxvel/nuxt/server/database";
import type { Seeder } from "@nuxvel/nuxt/server/database";

type IsAny<T> = 0 extends 1 & T ? true : false;

type NamespacedSeeder = typeof authorSeeder;

export const callsByDefinition = defineSeeder(async ({ call }) => {
  await call("_probe.author", authorSeeder);
  // @ts-expect-error a rate limit is not a seeder
  await call(loginRateLimit);
});

export const seedersNamespaceIsTyped: IsAny<NamespacedSeeder> extends true ? never : NamespacedSeeder extends Seeder ? true : never = true;
