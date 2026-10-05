# DevTools

## Introduction

In development, nuxvel adds a **nuxvel** tab to [Nuxt DevTools](https://devtools.nuxt.com). The tab shows what each request, job run and command did: its queries, tRPC calls, actions, mail and more. It also lists the jobs, audit entries, procedures and definitions of the app. Use it to see what the server does while you build a feature.

## Opening the tab

Open DevTools with `Shift + Alt + D` or the floating Nuxt icon. Then pick the **nuxvel** tab, under the server tabs. The tab shows after you authorize DevTools.

You do not register anything. DevTools is on by default in a new Nuxt app. The tab shows while `devtools.enabled` is not `false` in `nuxt.config.ts`.

The **Queue board** link at the top opens the [queue dashboard](./queues.md#the-dashboard) in a new window.

### Sections

The tab has these sections, in this order:

| Section | Contents |
|---|---|
| **Requests** | Each recent request, job run and command, as a timeline. See [Requests](#requests). |
| **Recent jobs** | The 20 newest jobs of all queues: queue, state (`waiting`, `active`, `completed`, `failed`, ...), attempts, dispatch delay, priority and failure reason. Also a count for each state. |
| **Recent audit entries** | The 20 newest `audit_log` rows: actor, action and target. |
| **tRPC procedures** | Each procedure path, its type (query or mutation) and the shape of its input. |
| **SQL** | The queries of recent entries. See [SQL](#sql). |
| **Mail** | The mail that you sent in development, and a preview of each mail. See [Mail](#mail). |
| **Events and listeners**, **Schedules**, **Policies**, **Flags and experiments**, **Channels**, **Mail, backfills and rate limits** | What nuxvel found in your `server/` folders. See [Registry catalog](#registry-catalog). |

Server routes, tasks, runtime config and storage are in the tabs of Nuxt DevTools itself. The nuxvel tab does not show them again.

### Live updates

The tab updates itself every 2 seconds while it is open and visible. When you close DevTools, open a different DevTools tab or hide the browser tab, the updates stop. They start again when you come back.

Each section loads on its own. When Redis is down, only the sections that read Redis show that they could not load: **Recent jobs**, **Schedules** and **Flags and experiments**. The other sections still show. A section that gives no answer within 3 seconds shows an error. The tab does not ask a section again until its last load answers.

### Access

The tab and its page, `/_nuxvel/devtools/`, exist only on the dev server. A production build has neither.

The page does not ask you to sign in to the app, and neither does the [queue dashboard](./queues.md#the-dashboard). Both answer only requests from this machine, sent to one of these hosts:

- `localhost` or `*.localhost`. `nuxvel dev` serves the app on these.
- A `127.x.x.x` address.
- `[::1]`.

All other requests get `403`. This includes a phone on the LAN that opens `nuxt dev --host`, and this machine when it opens the app by its LAN address. No key or link opens the page from a different machine. The tab is also behind the authorization of Nuxt DevTools.

## Requests

The **Requests** section lists the last 200 requests, job runs and commands, newest first. Each row shows:

- The label: `GET /posts`, the job name, or `task:run <name>`.
- The actor.
- The status.
- The duration.
- The number of recorded effects. A red badge shows how many of them are errors (error lines and log lines at level `error` or `fatal`). An orange badge shows how many are warnings, for example an N+1 warning.

Click a row to see its timeline. The timeline shows each effect in order, with its time from the start. An effect is one of these: queries, tRPC calls, actions, policy checks, flags, dispatched jobs, events, listener runs, mail, broadcasts, rate limits, cache reads, log lines and errors.

Expand a line to see all of its data. A field with a name like `password`, `token`, `secret`, `authorization`, `cookie` or `api_key` shows as `[redacted]`. For query parameters, see [SQL](#sql).

A `log` line from `useLogger()` keeps the plain-object fields of the line in `fields`. It also keeps the `Error` of the line in `err`, with its cause chain, a maximum of 5 levels deep. For example, `log.warn("charge failed", { invoiceId: 7 }, error)` shows `invoiceId` and the error when you expand the line.

A failed `trpc:call` line shows the code and the message of the error. For an input that fails its schema, the message is `Invalid input` and the summary also shows the errors per field, for example `failed in 3.1 ms: BAD_REQUEST: Invalid input (title: Title is required)`. The data of the line keeps them in `message` and `fields`.

Each line keeps about 16 KB of data at most. A larger line keeps its first 16 KB and shows "Cut at 16 KB". An entry keeps 1,000 lines at most, and drops the lines after that.

A request that ends in an error is in the list too, with the status of its error.

### Server entries

Some warnings and errors occur outside all requests, job runs and commands. Examples: Redis goes down, the worker cannot start, a timer fires after its response, or a promise rejects with no request. The section keeps these lines in an entry of the kind `server`, with the label `server`. A `server` entry keeps 50 lines. The next line starts a new entry.

A `server` entry keeps only `warn`, `error` and `fatal` log lines, and errors. An `info` or `debug` line outside an entry does not show.

### Console calls

The dev server sends each `console.*` call through the logger, with the tag `console`. A `console.warn` in a request, from your code, from Vue or from Nuxt, is a `log` line in the entry of that request. The payload size warning is an example. The terminal shows the same line one time. This works also when `features.devLogs` is `false`.

### Log lines of a failed request

The entry of a failed request keeps all of its log lines. These include the `failed` error line, the request line with the error status and an N+1 warning. In the terminal, these lines have the `req=` ID of the request too.

h3 calls the Nitro `error` hook and the error handler outside the request context of Nitro. In that code, `useEvent()` cannot find the request, so a log line cannot find its entry. nuxvel runs its `error` hook and its error handler in the context of the request again.

### Find an error by its request ID

```json
{ "message": "Something went wrong (ref: 3f1c9a2e-…)" }
```

An unexpected error sends only a generic message and the request ID to the client, in development too. See [What the client sees](./api.md#what-the-client-sees). The ID of the entry is the request ID. To see the real error, paste the request ID in the filter of the section, or open `/_nuxvel/devtools/?entry=<request id>`. The `error` line of the timeline shows the message and the stack of the error.

The `error` line also keeps the cause chain of the error, a maximum of 5 levels deep. Each cause has its name, its message and its stack. The summary of the line shows the error and its last cause, for example `DrizzleQueryError: Failed query: select … from "posts", caused by PostgresError: relation "posts" does not exist`. Open the line to see all the causes. A failed query shows its SQL but not its bound parameters. When the query used a table or a column that is not in the database, the line also has a `hint` that tells you to run `nuxvel db:generate` and `nuxvel db:migrate`. See [Migrations](./database.md#migrations).

### Server-rendered pages

A server render of a page is one entry. The tRPC calls and `useFetch` calls that it makes on the server go into the entry of the page.

These calls go through `event.fetch` or `event.$fetch` of the request. SSR tRPC, `useFetch` and `useRequestFetch()` use them. They send the request ID of the page, and a request with the ID of an open entry adds to that entry. A bare `$fetch` on the server does not go through the request, so it gets its own request ID and its own entry.

### Response headers

```http
X-Nuxvel-Debug-Id: 3f0c6d1e-…
Server-Timing: total;dur=48.2, db-query;desc="3 db:query", trpc-call;desc="1 trpc:call", job-dispatch;desc="1 job:dispatch"
```

Each response from the dev server names its entry and gives a summary. The Network panel of the browser shows `Server-Timing` in the Timing tab of the request.

To open the entry, go to `/_nuxvel/devtools/?entry=<id>` on the dev server. You can also paste the ID in the filter of the section. A production build sends neither header.

The entry of a job does not link to the request that dispatched it. Find the `job:dispatch` line in the request, then find the job by its name.

### Browser errors

```
15:21:42 ERROR browser  Error: click handler exploded
    at explode (http://localhost:3000/_nuxt/pages/index.vue:11:10)  path=/ req=3f0c6d1e
```

On the dev server, the browser sends its problems to the server. The terminal and the tab show each problem as a `browser` log line. The browser sends these problems:

- A Vue warning, at `warn`. Hydration mismatches are Vue warnings. The line shows the component trace.
- An error that Vue catches (`vue:error`) or that Nuxt reports (`app:error`), at `error`.
- An uncaught error (`error` event of `window`) and an unhandled promise rejection (`unhandledrejection`), at `error`.
- A failed tRPC call from the browser, at `warn`. A call that gets no answer from the server (`NETWORK_ERROR`) is at `error`. The line shows the procedure, the error code and the message.

An error line shows the stack of the error. Each line shows the path of the page, as `path=`. The browser sends an error object only one time, also when more than one handler gets it.

A problem goes into the entry of the server render of the page. In development, the payload of a server-rendered page holds its request ID, and the browser sends this ID with each problem. The terminal line shows this ID as `req=`. The problem goes into an entry of its own, with the label `BROWSER <path>`, in these conditions:

- The page has no server render, for example a page with `ssr: false`.
- The entry of the page is no longer in the list of the last 200 entries.
- The problem arrives before the server render of the page is complete.

After a client-side navigation, the problems no longer go into the entry of the first page. The browser creates a new ID for each navigation and sends it in place of the request ID. The server finds no entry with this ID, so it makes an entry with the label `BROWSER <path>`, with the path of the new page. All problems of that navigation go into this entry. The terminal line shows the new ID as `req=`.

The browser sends each problem with `navigator.sendBeacon()` to `POST /_nuxvel/devtools/api/browser-problems`. If `sendBeacon()` fails, it uses `fetch()` with `keepalive`. The route has the same [access](#access) rules as the tab. It accepts JSON of 32 KB at most, and a message of 16 KB at most. The client plugin and the route exist only on the dev server. A production build has neither. A Vue warning still shows in the console of the browser.

## Jobs and commands

```sh
NUXVEL_DEVTOOLS=1
```

The dev server records what its own requests do. `nuxvel queue:work`, `nuxvel task:run` and `nuxvel tinker` run in different processes. To record their work too, add `NUXVEL_DEVTOOLS=1` to `.env`. Each job run, task or REPL line then becomes one entry.

When a job fails, its entry shows the error with its stack, and the `failed` or `failed, retrying` log line that the terminal shows. This applies to every run of the worker: jobs, queued listeners, schedules, webhooks and mail. The worker writes these lines inside the run of the job, so they go into the entry of that job.

These processes send each finished entry to the dev server over Redis, on the `nuxvel:devtools:entries` stream. The stream keeps only the last 100 entries. The dev server shows the entries that arrive while it runs, not older ones.

Do not set `NUXVEL_DEVTOOLS` in production. A build made without it has no recorder. A process that runs with `NODE_ENV=production` ignores it.

## SQL

Pick a request, job run or command to see each query that it ran: the SQL, its parameters and its duration. The section shows the 20 most recent entries that ran a query.

### Redacted parameters

```sql
insert into "session" ("token", "user_id") values ($1, $2)
select * from "session" where "token" = $1
```

A parameter shows as `[redacted]` when the SQL binds it to a column with a secret name. A secret name contains `password`, `token`, `secret`, `authorization`, `cookie` or `api_key`, as in `access_token`. The SQL binds a parameter to a column in these ways:

- A value in an `insert`.
- A `set`, or a comparison: `=`, `<>`, `!=`, `like`, `ilike` or `in`, such as `"token" in ($1, $2)`.

All other parameters show as they are, including emails and names. A parameter that the SQL passes through a function or an expression, such as `lower($1)`, also shows as it is.

### Repeated queries

A query that runs 5 times or more in one entry is highlighted. These are the queries that the dev server [warns about](./database.md#repeated-queries-n1). A query inside `allowRepeatedQueries()` shows its reason instead.

### EXPLAIN

**EXPLAIN** runs `EXPLAIN (ANALYZE, BUFFERS)` on the query and shows the plan. `ANALYZE` executes the statement. nuxvel runs it in a transaction and always rolls the transaction back. An `INSERT`, `UPDATE` or `DELETE` thus leaves no rows. A sequence that the statement increments stays incremented.

EXPLAIN uses the parameters that the query really ran with. It does not use the shortened or redacted copy that the section shows.

EXPLAIN works only for the queries of the requests of this dev server. An entry from `queue:work`, `task:run` or `tinker` shows its queries, but EXPLAIN on them returns `404`.

## Mail

```sh
NUXT_MAILPIT_URL=http://localhost:8025
```

The **Mail** section lists the 20 newest messages that [Mailpit](./mail.md) received. Each message links to its page in Mailpit. **Open Mailpit** opens the inbox.

The section reads Mailpit at `http://localhost:8025`. `docker compose up -d` starts Mailpit there. When your Mailpit runs at a different address, set `NUXT_MAILPIT_URL` in `.env`.

### Previewing a mail

Pick a mail under **Preview with sample input** and press **Preview**. The section renders the mail and sends nothing.

```ts
// server/mail/post/published.mail.ts
export const postPublishedMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), url: z.url() }),
  subject: ({ title }) => `New post: ${title}`,
  render: (props) => h(PostPublished, props),
  preview: () => ({
    to: "ada@example.com",
    title: "Hello",
    url: "https://blog.example.com/posts/hello",
  }),
});
```

The input starts as the value that the `preview` option of the mail returns. When a mail has no `preview`, the input starts as a sample made from its `input` schema. For example, an email field gets `someone@example.com` and a string field gets `"Sample"`. Edit the input to see other cases. When the schema rejects the input, the section shows the validation error.

The preview renders in a sandboxed frame, so the scripts of the mail do not run.

Mail holds personal data. This section, like the rest of the tab, exists only on the dev server and answers only this machine.

## Registry catalog

nuxvel has no registration files that you can read. The tab lists what nuxvel found instead:

| Section | Contents |
|---|---|
| **Events and listeners** | Each event with its payload version and shape, and its listeners, `sync` or `queued`. An event with no listeners shows "nothing listens". |
| **Schedules** | When each schedule runs, in words and as a cron pattern. Its next run shows after the worker registers it. |
| **Policies** | The rules for each table. A rule inside `allowSystem()` shows "system allowed". |
| **Flags and experiments** | The default and current targeting of each flag. The variants of each experiment, and if it is running. |
| **Channels** | The events of each channel, and the number of connections that this server keeps open on it. |
| **Mail, backfills and rate limits** | The input of each mail, the table and progress of each backfill, and the allowance of each shared rate limit. |

You can move a definition with [`renamed()`](./index.md#renaming-a-definition). When a schedule, flag, experiment or backfill still stores its data under its old name, the section shows that name under **Stored as**. A listener that still answers to an old name shows it after its mode.

## Checking the tab by hand

1. Run `nuxvel dev`. Open the app, then the **nuxvel** tab in DevTools.
2. Dispatch a job: call an action that uses `dispatchAfterCommit()`.
3. The job shows as `waiting`. The worker inside `nuxvel dev` runs it, and it changes to `completed` without a reload. With `nuxvel dev --no-queue`, start `nuxvel queue:work` to run it.

## See also

- [Queues](./queues.md#the-dashboard)
- [Database](./database.md#repeated-queries-n1)
- [Mail](./mail.md)
- [Observability](./observability.md)
