import { runSeeder } from "@nuxvel/nuxt/testing";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const seederNameIsTyped: IsAny<SeederName> extends true
  ? never
  : string extends SeederName
    ? never
    : "_probe.posts" extends SeederName
      ? true
      : never = true;

export const callsOnlyDefinedSeeders = defineSeeder(async ({ call }) => {
  await call("_probe.author");

  // @ts-expect-error no seeder is named probe.missing
  await call("probe.missing");
});

export async function runSeederTakesOnlyDefinedSeeders() {
  await runSeeder("_probe.posts");

  // @ts-expect-error no seeder is named probe.missing
  await runSeeder("probe.missing");
}
