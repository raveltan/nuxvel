# nuxvel playground

A small real app on nuxvel, one page per capability, plus the
`_`-prefixed fixtures the framework tests run against: pages, routes,
jobs, channels, events, listeners, routers and the rest. Fixtures only
exist when Nuxt builds for tests (`nuxt.config.ts` ignores every `_*`
file under `app/` and `server/` otherwise), so `nuxt dev` and `nuxt
build` serve the demo alone. The demo pages are linked from `/`.

## Run it

From the repository root, run `npm install`. Then, in `playground/`, copy the sample environment file. Its values match the dev services of the root `docker-compose.yml`:

```bash
cp .env.example .env
```

Start everything from the repository root:

```bash
npm run dev
```

It starts the dev services of the root `docker-compose.yml` (Postgres, Redis, Mailpit, SeaweedFS, Bugsink), runs the migrations, then runs `nuxvel dev` in `playground/`. The playground runs at `https://playground.localhost`, Storybook at `https://storybook.playground.localhost`, and the queue worker runs inside the dev server. Before it starts, it prints the address of each service. When you stop it, it stops the services.

Run `./nv storage:setup` once, to create the storage bucket. Mail lands in Mailpit at <http://localhost:8025>.

## The `nv` command

`./nv` in `playground/` runs the nuxvel CLI of this repository, the same as `./nv` in an app made with `create-nuxvel`. Use it to try a command against the playground:

```bash
./nv --help
./nv db:migrate
./nv db:fresh --seed --force
./nv route:list
./nv dev --no-https    # plain nuxt dev at http://localhost:3000
```

The CLI comes from `packages/cli` through the workspace link, so a change there shows on the next run. Do not run a generator (`./nv make:*`) here: it writes files into the playground, which the framework tests use. To try a generator, make an app with `create-nuxvel` and link it. See the [CLI guide](../docs/cli.md).

## Manual checklist

Sign up at `/sign-up` first; every demo page sits behind sign-in. Open
a second browser (or a private window) for the checks that need two
users.

**Home and auth** — `/`, `/sign-up`, `/sign-in`
- [ ] `/` lists one card per demo.
- [ ] Signing up lands on `/` showing "Signed in as …".
- [ ] "Sign out" on `/`, or in the user menu of any demo page, signs out.
- [ ] Opening `/posts` signed out redirects to `/sign-in`.
- [ ] A wrong password on `/sign-in` shows an error on the form.

**Posts** — `/posts`, `/posts/new`, `/posts/<id>/edit`
- [ ] An empty list shows "No posts yet" with a link to write one.
- [ ] Submitting `/posts/new` with no title shows the error under the
      field, with no request in the network tab.
- [ ] A created post shows in the list; "Edit" changes it.
- [ ] Clearing the body on edit shows "Body cannot be empty after trimming".
- [ ] "Delete" removes a post at once.
- [ ] A second user sees your posts without "Edit" or "Delete".

**Realtime** — `/posts` in two browsers
- [ ] A post created in one browser appears in the other without a reload.

**Account** — `/account`
- [ ] Your posts show newest first. A deleted post goes from the list.

**Jobs** — `/jobs`, with `queue:work` running
- [ ] "Run countdown" moves the bar to 100% and shows `completed` with
      the time it finished.
- [ ] "Run failing countdown" shows `failed` and its error after two
      retries.
- [ ] With `queue:work` stopped, a run stays `idle` until it is restarted.

**Profile** — `/profile`
- [ ] Choosing a PNG, JPEG or WebP under 2 MB replaces the avatar.
- [ ] A file over 2 MB shows an error instead.
- [ ] "Send me a test mail" says the mail was queued, and with
      `queue:work` running the welcome mail reaches Mailpit.

**Flags** — `/flags`
- [ ] `probe-rollout` shows `off` and "Use the classic flow".
- [ ] `npx nuxvel flag:set probe-rollout --role user --value true`
      flips it to `on` and "Try the new flow" without a reload.
- [ ] `probe-cta` shows `control` until `npx nuxvel experiment:start
      probe-cta`, then your assigned variant (`control` or `green`),
      without a reload.
