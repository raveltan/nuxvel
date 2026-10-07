# CLI

`./nv <command>`. Flags: `./nv <command> --help`.

## Run

| Command | Does |
|---|---|
| `npm run dev` | dev server + queue worker, starts the Docker services |
| `./nv services up` / `down` | start / stop the Docker services |
| `./nv test:functional` | functional tests. `--changes-only`, `--watch` |
| `./nv test:ui` | component tests (stories) |
| `./nv test:e2e` | end-to-end tests |
| `./nv test:arch` | architecture rules |
| `npm run typecheck` | types |
| `./nv route:list`, `./nv event:list`, `./nv channel:list` | list routes, events, channels |
| `./nv tinker` | REPL in the app, factories in scope |

## Database

| Command | Does |
|---|---|
| `./nv db:generate` | write a migration from the schema files |
| `./nv db:migrate` | run the migrations |
| `./nv db:seed [name...]` | run seeders, default `database` |
| `./nv db:fresh [--seed]` | drop all tables, migrate (dev only) |
| `./nv db:rollback` | undo the last migration (needs a hand-written `down/` file) |
| `./nv db:studio` | Drizzle Studio |

No command adds a column. Edit the table file, then `./nv db:generate`.

## Generators

`--domain <name>` writes to `server/domains/<name>/`. `--force` overwrites.

| Command | Writes |
|---|---|
| `make:resource post title body:text --ui` | table, Zod schemas, user data, policy, create/update/delete actions, router (list, byId, create, update, delete), tests. `--ui`: list page + form modal |
| `make:schema post title body:text` | table + `shared/schemas/post.ts` |
| `make:router post [--crud fields]` | router (+ CRUD) |
| `make:action posts/archive-post [fields]` | action + test |
| `make:policy post` | policy |
| `make:job post.notify [fields]` | job + test |
| `make:event post.published [fields]` | event + test |
| `make:listener post.notify --event post.published` | listener + test |
| `make:mail post.published` | mail + Vue template + test |
| `make:notification post.published` | notification + test |
| `make:channel posts` | channel + test |
| `make:webhook billing` | inbound webhook + test |
| `make:schedule posts.prune-drafts` | schedule |
| `make:task reindex-posts` | task for `task:run` |
| `make:flag new-editor`, `make:experiment subscribe-button` | flag, experiment |
| `make:backfill posts-content --table post` | backfill + test |
| `make:factory post`, `make:seeder blog` | factory + test, seeder |
| `make:page posts/index`, `make:story base/Button` | page, story |
| `make:test actions/posts/create-post.action` | test next to a `server/` file |

## Fields

`name[:type[=arg]][:modifier...]`

| Type | Column | Zod |
|---|---|---|
| `string` (default) | `varchar(255)` | `z.string().trim().min(1).max(255)` |
| `text` | `text` | `z.string().trim().min(1)` |
| `email` | `varchar(255)` | `z.email().max(255)` |
| `integer`, `bigint` | `integer`, `bigint` | `z.number().int()` |
| `boolean` | `boolean` | `z.boolean()` |
| `decimal[=p,s]` | `numeric(10, 2)` | decimal string |
| `uuid` | `uuid` | `z.uuid()` |
| `date` | `date` (string) | `z.iso.date()` |
| `timestamp` | `timestamp` (Date) | `z.date()` |
| `json` | `jsonb` | `z.json()` |
| `enum=a,b` | `text` | `z.enum(["a", "b"])` |
| `references[=table]` | FK + index, `onDelete: "cascade"` | id type |

Modifiers: `nullable` (FK `set null`), `unique`, `index`, `default=<value>`. Reserved names: `id`, `createdAt`, `updatedAt`, `deletedAt`, `ownerId`, `searchVector`. `due_on` → column `due_on`, key `dueOn`.

## Other

`queue:work`, `queue:failed`, `queue:retry <id|all>`, `schedule:list`, `schedule:run <name>`, `task:run <name>`, `backfill:status`, `flag:list`, `flag:set <name>`, `audit:verify`, `user:export <id>`, `user:erase <id>`, `key:issue <userId> --name <name>`, `down`, `up`, `build`, `doctor`.
