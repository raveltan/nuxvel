import * as $seeders from "#nuxvel/seeders-namespace";

type IsAny<T> = 0 extends 1 & T ? true : false;

type NamespacedSeeder = typeof $seeders._probe.author;

export const callsByDefinition = defineSeeder(async ({ call }) => {
  await call("_probe.author", $seeders._probe.author);
  // @ts-expect-error a rate limit is not a seeder
  await call($rateLimits.login);
});

export const seedersNamespaceIsTyped: IsAny<NamespacedSeeder> extends true ? never : NamespacedSeeder extends Seeder ? true : never = true;
