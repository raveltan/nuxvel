import { postFactory } from "#nuxvel/factories";
import { userFactory } from "#nuxvel/factories";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

const POSTS = [
  { title: "Welcome to the playground", body: "This post comes from server/seeders/database.seeder.ts." },
  { title: "Editing a post", body: "Select Edit under a post to change its title or body." },
  { title: "Live updates", body: "Create a post in a second tab. It shows here without a reload." },
];

export const databaseSeeder = defineSeeder(async () => {
  const demo = await userFactory
    .withPassword(DEMO_PASSWORD)({ name: "Demo User", email: DEMO_EMAIL, emailVerified: true });

  for (const post of POSTS) await postFactory.for("authorId", demo)(post);

  console.log(`Sign in as ${DEMO_EMAIL} with the password ${DEMO_PASSWORD}`);
});
