# nuxvel app

A Nuxt app with nuxvel: database, typed API, validation, auth and actions. The [nuxvel docs](https://github.com/raveltan/nuxvel/blob/main/docs/index.md) describe each feature.

## Requirements

- Node.js 24. `.nvmrc` names the version, so `nvm use` selects it.
- Docker, running. `docker-compose.yml` runs Postgres, Redis, Mailpit and SeaweedFS.

## First run

```bash
npm install
./nv services up
./nv test
./nv db:migrate
./nv db:seed
npm run dev
```

- `./nv services up` starts the dev services from `docker-compose.yml` and leaves them running. `./nv services down` stops them.
- `./nv test` runs the tests in `tests/`, except the end-to-end tests in `tests/e2e/`.
- `./nv db:migrate` creates the tables in the dev database from `.env`.
- `./nv db:seed` runs `server/seeders/database.seeder.ts`. It creates the demo user `demo@example.com` and prints its password, `demo-password`.
- `npm run dev` starts the Nuxt dev server and the queue worker. `./nv test`, `./nv test:e2e` and `npm run dev` start the dev services themselves when they are not running, and stop them again when they end.

The app runs at `https://<name>.localhost`. `<name>` is the `name` in `package.json`. The first run asks for your password to trust a local certificate. To serve plain `nuxt dev` at `http://localhost:3000`, run `./nv dev --no-https`.

Before the dev server starts, `npm run dev` prints the addresses of the app and its services:

```
  App        https://my-app.localhost
  DevTools   https://my-app.localhost/__nuxt_devtools__/client/
  Postgres   postgres://nuxvel:nuxvel@localhost:5432/nuxvel
  Redis      redis://localhost:6379
  Mailpit    http://localhost:8025
  Storage    http://localhost:8333 (bucket nuxvel)
  Queue      runs inside the dev server
```

Mailpit shows every mail that the app sends. The nuxvel tab in DevTools shows jobs, audit entries, procedures and the queue.

## Storybook

```bash
npm run storybook
```

Storybook shows each component alone, with no server, at `http://localhost:6006`. Run it next to `npm run dev`; the dev server does not start it. The stories of the nuxvel components are there from the start. `./nv make:story AppLogo` writes a story for `app/components/AppLogo.vue`. `npm run storybook:build` writes a static site to `storybook-static/`. See the [Storybook guide](https://github.com/raveltan/nuxvel/blob/main/docs/storybook.md).

## Signing in as the demo user

Open `/sign-in` and sign in as `demo@example.com` with the password `demo-password`. To start again from an empty database, run `./nv db:fresh --seed --force`. It drops every table, migrates and seeds.

## Signing up

1. Open `/sign-up`.
2. Enter a name, an email and a password of 8 or more characters.
3. Select **Sign up**.

The app creates the account, signs you in and opens `/`. The home page shows your email and a **Sign out** button. Use `/sign-in` to sign in again.

The pages are `app/pages/sign-up.vue` and `app/pages/sign-in.vue`. Each page renders the `<AuthForm>` component of nuxvel. See the [auth guide](https://github.com/raveltan/nuxvel/blob/main/docs/auth.md).

## Trying code in a REPL

```bash
./nv tinker
```

`tinker` opens a REPL inside the app's server. The tables, the actions and every server helper, such as `useDb()` and `$mails`, are in scope with no imports:

```
nuxvel> await useDb().select().from(userTable)
```

## Next steps

Each step adds one part of a blog.

### Add a table

```bash
./nv make:schema tag name:unique
```

This creates the table in `server/database/schema/tag.schema.ts` and its Zod inputs in `shared/schemas/tag.ts`. Each field after the name becomes a column and a Zod field. Write a field as `name[:type[=arg]][:modifier...]`. The type is `string` if you do not write it. Here, `name` is a `varchar(255)` column with a unique constraint. When you give no fields, the command asks for them one at a time.

### Add a resource

```bash
./nv make:resource post published:boolean:default=false --soft-deletes --searchable title,body --ui
./nv db:generate
./nv db:migrate
```

The first command creates a complete `post` resource:

- the `post` table with a `published` column, `title` and `body` columns, a search index and a `deleted_at` column,
- the policy `server/policies/post.policy.ts`,
- the create, update, delete and restore actions in `server/actions/post/`,
- the router `server/trpc/routers/post.router.ts`. Its `list` is paginated and takes the search text `q`,
- the test `server/trpc/routers/post.router.test.ts`,
- the pages `/post` and `/post/new`, and the component `app/components/PostForm.vue`. The list page shows the posts in a `<DataTable>` with a search input. The forms have a control for each field, for example a checkbox for `published`. The **Edit** link in each row opens `PostForm` in a modal at `/post?edit=<id>`, and the form saves with `useActionForm()`. The **Delete** button in each row asks first, then removes the row at once.

The next two commands add the table to the dev database. Open `/post` to use the pages. Every procedure is also a REST endpoint. Add `--no-openapi` to leave that out. `./nv make:router post --crud` creates the same server files without the pages.

### Run a migration

```bash
./nv db:generate
./nv db:migrate
```

`db:generate` writes a migration for your schema changes to `server/database/migrations/`. Read the SQL, then run `db:migrate` to apply it to the dev database.

### Add fake data

```bash
./nv make:factory post
```

This creates `server/factories/post.factory.ts`, with a [Faker](https://fakerjs.dev) value for each required column, and a test. The owner of a post is a new user from `userFactory`. Change the values so that they look like real posts, for example `body: () => faker.lorem.paragraphs(3)`. Then use the factory in the seeder:

```ts
// server/seeders/database.seeder.ts
import { postFactory } from "../factories/post.factory";

// in the seeder function:
await postFactory.count(10)();
```

Run `./nv db:fresh --seed --force` to seed the dev database again.

### Add a page

```bash
./nv make:page about
```

This creates `app/pages/about.vue`. To read posts in a page, use `$api.post.list.useQuery()`.

A missing page or a failed render shows `app/error.vue`, with the status, the message and the request ID.

### Write a test

```bash
./nv make:test actions/post/create-post.action
```

This creates `server/actions/post/create-post.action.test.ts`. Replace its `it.todo` with a test that calls the action with the fixtures from `@nuxvel/nuxt/testing`. Run `./nv test` to run it.

```bash
./nv make:test post --e2e
npm run test:e2e
```

The first command creates `tests/e2e/post.test.ts`, which opens `/post` in a browser with `visit()`. The test fails when the page has an error or goes to a different URL. `npm run test:e2e` installs the Playwright browser, then runs the tests in `tests/e2e/`.

## Deploying

- `Dockerfile` builds a production image. To run the queue worker, run the same image with `NUXVEL_ROLE=worker`.
- `.github/workflows/ci.yml` typechecks, tests and builds the app on each push to `main` and on each pull request.
