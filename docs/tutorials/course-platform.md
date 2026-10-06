# Tutorial: an online course platform

## Introduction

This tutorial builds `academy`, an online course platform, in the way that a team structures a larger product. Instructors write courses and add lessons with files. Students find a course in the catalogue, enroll and mark each lesson complete. When a student completes the last lesson, the app issues a certificate and mails it. It also tells the student in the bell, and it tells the school's learning management system (LMS) through a webhook. Admins can change every course.

The app is the capstone of the tutorials. [Tutorial: your first nuxvel app](./first-app.md) comes first. This tutorial uses many parts of nuxvel together, at a moderate depth. Each chapter links to the focused tutorial or guide for more.

| Chapter | Parts of nuxvel |
|---|---|
| 2. The structure | domain folders, a module as a Nuxt layer |
| 3. Courses and lessons | generators with `--domain`, three roles, `roleProcedure()`, policies, full-text search, pagination, `defineUpload()` |
| 4. Enrollment and progress | actions, typed failures, domain events, a policy with `preload`, the privacy declaration |
| 5. Listeners and notifications | queued listeners, `notify()` |
| 6. The certificates module | a module with its own domain, a sync listener, `dispatchAfterCommit()` and the outbox, a job, a mail |
| 7. The pages | `<DataTable>`, `<QueryState>`, `useActionForm()`, `<UploadField>`, a seeder |
| 8. Component tests | stories with `play`, `fillForm` and `trpcSpy` |
| 9. A beta feature | a feature flag |
| 10. The LMS integration | the OpenAPI document, an API key, an outbound webhook |
| 11. Journeys in a browser | end-to-end tests |
| 12. All the checks | `nuxvel test:arch` and the other checks |
| 13. Ship it | a link to [Tutorial: ship and run an app](./ship-and-run.md) |

Each chapter adds tests in the layer that owns each check:

| Layer | Command | Checks |
|---|---|---|
| Functional | `./nv test` | the server: procedures, policies, actions, events, jobs, mails, the REST API |
| Component | `npm run test:ui` | the states of one component, with a mocked server |
| End-to-end | `npm run test:e2e` | a journey across pages in a browser |

See [Testing](../testing.md). You need Node.js 24, Docker and about two hours. Run every command from the app folder.

## 1. Create the app

```bash
npm create nuxvel@latest academy
cd academy
npm install
./nv services up
./nv test
```

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

See [Starting a new app](../create.md) for what the first command writes. `./nv services up` starts Postgres, Redis, Mailpit and SeaweedFS from `docker-compose.yml`. They stay running until `./nv services down`.

## 2. The structure

A small app keeps each kind of file in its own folder: tables in `server/database/schema/`, actions in `server/actions/`, routers in `server/trpc/routers/`. In a product with many features, the files of one feature are then far apart. This app uses two tools that keep them together:

- A [domain folder](../auto-imports.md#domain-folders), `server/domains/<domain>/`, holds the tables, actions, events, listeners, policies, routers, uploads, flags and factories of one domain. The app has two domains: `courses` (what instructors write) and `learning` (what students do).
- A [module](../modules.md), `layers/<name>/`, is a Nuxt layer with its own pages and server code. The certificates are a module. Another team can own it, and it reacts to the events of the app without an import of the app's files.

At the end of the tutorial, the app has this structure:

```
server/
  domains/
    courses/
      actions/        create-course, update-course, delete-course, create-lesson, ...
      factories/      course.factory.ts, lesson.factory.ts
      policies/       course.policy.ts, lesson.policy.ts
      routers/        course.router.ts (trpc.courses.course), lesson.router.ts (trpc.courses.lesson)
      schema/         course.schema.ts, lesson.schema.ts
      uploads/        lesson-file.upload.ts (upload "courses.lesson-file")
    learning/
      actions/        enroll, complete-lesson
      events/         enrolled, course-finished
      factories/      enrollment.factory.ts, lesson-progress.factory.ts
      flags/          weekly-goal.flag.ts
      listeners/      notify-instructor, announce-finish
      notifications/  new-student, course-finished
      routers/        learning.router.ts (trpc.learning)
      schema/         enrollment.schema.ts, lesson-progress.schema.ts
  privacy/            course, lesson and enrollment user data
  utils/              instructor-procedure.ts
layers/
  certificates/
    app/pages/certificates/[code].vue
    server/domains/certificate/
      factories/ jobs/ listeners/ mail/ routers/ schema/
```

The domain name is the first word of each name. The action in `server/domains/learning/actions/enroll.action.ts` is `learning.enroll`. A router file with the name of its domain is the domain itself: `routers/learning.router.ts` is `trpc.learning`, and `routers/course.router.ts` in the `courses` domain is `trpc.courses.course`. [Tutorial: ship and run an app](./ship-and-run.md#1-a-domain-folder) shows the same rules on a smaller app.

## 3. Courses and lessons

### The tables

An instructor owns a course. A course has a title, a summary and a status, `draft` or `published`. The catalogue searches the title and the summary. A lesson belongs to a course and has a title and a body. Generate the two CRUD slices into the `courses` domain:

```bash
./nv make:router course status:enum=draft,published:default=draft --crud --domain courses --searchable title,summary --no-openapi
./nv make:router lesson title body:text course:references --crud --domain courses --no-openapi
```

```
✔ Created server/domains/courses/schema/course.schema.ts
✔ Created shared/schemas/course.ts
✔ Created server/privacy/course.user-data.ts
✔ Created server/domains/courses/policies/course.policy.ts
✔ Created server/domains/courses/actions/create-course.action.ts
✔ Created server/domains/courses/actions/update-course.action.ts
✔ Created server/domains/courses/actions/delete-course.action.ts
✔ Created server/domains/courses/routers/course.router.ts
✔ Created server/domains/courses/routers/course.router.test.ts
◇ Updated types (nuxt prepare) (2.1s)
✔ Created server/domains/courses/schema/lesson.schema.ts
✔ Created shared/schemas/lesson.ts
✔ Created server/privacy/lesson.user-data.ts
✔ Created server/domains/courses/policies/lesson.policy.ts
✔ Created server/domains/courses/actions/create-lesson.action.ts
✔ Created server/domains/courses/actions/update-lesson.action.ts
✔ Created server/domains/courses/actions/delete-lesson.action.ts
✔ Created server/domains/courses/routers/lesson.router.ts
✔ Created server/domains/courses/routers/lesson.router.test.ts
◇ Updated types (nuxt prepare) (1.2s)
```

`--crud` adds an `ownerId` column that references the user, and writes the policy, the three actions, the router, a test and the privacy declaration. Here the owner of a course is its instructor. `--searchable title,summary` adds the two text columns and makes them searchable. `--no-openapi` leaves out the REST endpoints: chapter 10 exposes one endpoint on purpose. See [CLI: `make:router`](../cli.md#nuxvel-makerouter-name---crud).

```ts
// server/domains/courses/schema/course.schema.ts
import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { searchable, searchIndex, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "../../../database/schema/auth.schema";

export const courseTable = pgTable("course", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  ...searchable(["title", "summary"]),
  ...timestamps(),
}, (table) => [index("course_owner_id_idx").on(table.ownerId), searchIndex(table)]);

export type CourseRow = typeof courseTable.$inferSelect;
export type NewCourseRow = typeof courseTable.$inferInsert;
```

A lesson can have a file, for example the notes as a PDF. Add a `fileKey` column to the lesson table. The column is not in the generated inputs, so a client cannot write a storage key into it:

```ts
// server/domains/courses/schema/lesson.schema.ts
import { index, integer, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "../../../database/schema/auth.schema";
import { courseTable } from "./course.schema";

export const lessonTable = pgTable("lesson", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  courseId: integer("course_id").notNull().references(() => courseTable.id, { onDelete: "cascade" }),
  fileKey: text("file_key"),
  ...timestamps(),
}, (table) => [index("lesson_owner_id_idx").on(table.ownerId), index("lesson_course_id_idx").on(table.courseId)]);

export type LessonRow = typeof lessonTable.$inferSelect;
export type NewLessonRow = typeof lessonTable.$inferInsert;
```

Write the migration and apply it to the dev database:

```bash
./nv db:generate --name courses
./nv db:migrate
```

```
[✓] Your SQL migration file ➜ server/database/migrations/0017_courses.sql 🚀
```

Generate a factory for each table. `make:factory` gives each required column a value, and a reference a row of the target table:

```bash
./nv make:factory course --domain courses
./nv make:factory lesson --domain courses
```

```
✔ Created server/domains/courses/factories/course.factory.ts
✔ Created server/domains/courses/factories/course.factory.test.ts
◇ Updated types (nuxt prepare) (1.1s)
✔ Created server/domains/courses/factories/lesson.factory.ts
✔ Created server/domains/courses/factories/lesson.factory.test.ts
◇ Updated types (nuxt prepare) (1.1s)
```

### Three roles

The `user` table has a `role` column. A new account has the role `user`, and in this app a `user` is a student. An `instructor` writes courses. An `admin` can change every course. Sign-up cannot set the role, so a student cannot make itself an instructor. See [User roles](../auth.md#user-roles).

The generated router uses `authedProcedure`, so every signed-in user could create a course. Give the instructors their own procedure builder. A file in `server/utils/` is auto-imported on the server, so every router of every domain can use it:

```ts
// server/utils/instructor-procedure.ts
export const instructorProcedure = roleProcedure(["instructor", "admin"]);
```

`roleProcedure()` refuses a student with `FORBIDDEN` and a guest with `UNAUTHORIZED`. It checks the role before it parses the input. See [Role procedures](../auth.md#role-procedures).

The role decides who may use a procedure. The policy decides which rows. The generated policy lets the owner or an admin change and delete a course:

```ts
// server/domains/courses/policies/course.policy.ts
import { courseTable } from "#nuxvel/schema";

export const coursesCoursePolicy = definePolicy(courseTable, {
  update: (actor, row) => row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin",
  delete: (actor, row) => row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin",
});
```

The update and delete actions load the row and call `authorize()` with this policy. The reads of the router add the owner to the query, `eq(courseTable.ownerId, ctx.user.id)`, so an instructor never sees the drafts of another instructor. A row of another instructor gives `NOT_FOUND`, the same as a row that does not exist. This is the tenant boundary of the app. See [Scoping reads](../authorization.md#scoping-reads).

### The catalogue

Visitors browse the published courses. Add two public procedures to the course router, and change each `authedProcedure` of the file to `instructorProcedure`. `catalogue` searches and pages, and `show` returns one published course with the titles of its lessons:

```ts
// server/domains/courses/routers/course.router.ts
import { and, desc, eq } from "drizzle-orm";
import { createCourseAction } from "#server/domains/courses/actions/create-course.action";
import { updateCourseAction } from "#server/domains/courses/actions/update-course.action";
import { deleteCourseAction } from "#server/domains/courses/actions/delete-course.action";
import { z } from "zod";
import { courseTable, lessonTable } from "#nuxvel/schema";

export const coursesCourseRouter = {
  catalogue: publicProcedure
    .input(paginationSchema.optional())
    .output(paginated(publicCourseSchema))
    .query(({ input }) => {
      const q = input?.q ?? "";

      return paginate(
        useDb()
          .select()
          .from(courseTable)
          .where(and(eq(courseTable.status, "published"), search(courseTable, q)))
          .orderBy(desc(searchRank(courseTable, q)), desc(courseTable.id))
          .$dynamic(),
        input,
      );
    }),
  show: publicProcedure
    .input(courseIdInput)
    .output(publicCourseSchema.extend({ lessons: z.array(z.object({ id: z.number(), title: z.string() })) }))
    .query(async ({ input }) => {
      const course = await useDb()
        .select()
        .from(courseTable)
        .where(and(eq(courseTable.id, input.id), eq(courseTable.status, "published")))
        .then(firstOrFail);
      const lessons = await useDb()
        .select({ id: lessonTable.id, title: lessonTable.title })
        .from(lessonTable)
        .where(eq(lessonTable.courseId, course.id))
        .orderBy(lessonTable.id);

      return { ...course, lessons };
    }),
  list: instructorProcedure
    .input(courseListInput)
    .output(paginated(courseSchema))
    .query(({ input, ctx }) =>
      paginate(
        useDb()
          .select()
          .from(courseTable)
          .where(and(eq(courseTable.ownerId, ctx.user.id), listWhere(courseTable, input.filters), search(courseTable, input.q ?? "")))
          .orderBy(...listOrderBy(courseTable, input.sort), desc(searchRank(courseTable, input.q ?? "")), desc(courseTable.id))
          .$dynamic(),
        input,
      ),
    ),
  byId: instructorProcedure
    .input(courseIdInput)
    .output(courseSchema)
    .query(({ input, ctx }) =>
      useDb()
        .select()
        .from(courseTable)
        .where(and(eq(courseTable.id, input.id), eq(courseTable.ownerId, ctx.user.id)))
        .then(firstOrFail),
    ),
  create: instructorProcedure
    .input(createCourseInput)
    .output(courseSchema)
    .mutation(async ({ input, ctx }) => {
      const row = await createCourseAction(input, { actor: ctx.actor });
      flash("Course created");
      return row;
    }),
  update: instructorProcedure
    .input(updateCourseInput)
    .output(courseSchema)
    .mutation(async ({ input, ctx }) => {
      const row = await updateCourseAction(input, { actor: ctx.actor });
      flash("Course saved");
      return row;
    }),
  delete: instructorProcedure
    .input(courseIdInput)
    .output(courseIdInput)
    .mutation(async ({ input, ctx }) => {
      const row = await deleteCourseAction(input, { actor: ctx.actor });
      flash("Course deleted");
      return row;
    }),
};
```

`search(courseTable, q)` matches the words of `q` in the title and the summary, and `searchRank()` puts the best match first. A blank `q` matches every row. `paginate()` returns one page and the totals. The order ends on `id`, so two rows with the same rank stay on the same page. See [Full-text search](../search.md#with-pagination).

A public procedure must not send private columns. The course schema has `ownerId`, the ID of the instructor's account. Add a smaller schema for the public procedures:

```ts
// shared/schemas/course.ts, at the end
export const publicCourseSchema = courseSchema.pick({ id: true, title: true, summary: true });
```

The `.output()` schema removes each field that it does not list, so `ownerId` does not reach the browser.

### Lessons with a file

An instructor uploads the file of a lesson. The browser sends the file directly to storage, and the server never receives the bytes. An upload in a domain folder goes in its `uploads/` folder:

```ts
// server/domains/courses/uploads/lesson-file.upload.ts
export const coursesLessonFileUpload = defineUpload({
  maxSize: 20 * 1024 * 1024,
  allowedTypes: ["application/pdf", "image/png", "image/jpeg"],
  authorize: ({ user }) => user?.role === "instructor" || user?.role === "admin",
});
```

The upload is `courses.lesson-file`, at `POST /api/uploads/courses.lesson-file`. The browser gets a key under `tmp/`. The create action moves the file out of `tmp/` with `promoteUpload()`, which checks the size and the first bytes of the file. See [Storage](../storage.md#keeping-an-upload).

The create input takes the `tmp/` key, and the update input does not. Add the input and the output with the file to the shared schemas:

```ts
// shared/schemas/lesson.ts, at the end
export const newLessonInput = createLessonInput.extend({ fileKey: z.string().optional() });

export const lessonWithFileSchema = lessonSchema.extend({ fileUrl: z.string().nullable() });
```

Change the create action. It checks that the course belongs to the instructor, promotes the file, and gives the lesson the owner of its course:

```ts
// server/domains/courses/actions/create-lesson.action.ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { lessonTable, courseTable } from "#nuxvel/schema";

export const createLessonAction = defineAction({
  input: newLessonInput,
  handler: async ({ fileKey, ...input }, ctx) => {
    const course = await useDb()
      .select()
      .from(courseTable)
      .where(and(eq(courseTable.id, input.courseId), eq(courseTable.ownerId, ctx.actor.userId ?? ctx.actor.id)))
      .then(firstOrFail);

    const storedKey = fileKey
      ? await promoteUpload({ upload: "courses.lesson-file", key: fileKey, to: `lessons/${course.id}/${randomUUID()}` })
      : null;

    const row = await useDb()
      .insert(lessonTable)
      .values({ ...input, ownerId: course.ownerId, fileKey: storedKey })
      .returning()
      .then(firstOrFail);

    await audit("lesson.created", row);

    return row;
  },
});
```

An action runs in a transaction. When the insert fails, nuxvel deletes the promoted file after the rollback.

The lesson router keeps the three mutations on `instructorProcedure`. Remove the generated `list` and `byId`: students read the lessons of one course, and chapter 4 adds that query.

```ts
// server/domains/courses/routers/lesson.router.ts
import { createLessonAction } from "#server/domains/courses/actions/create-lesson.action";
import { updateLessonAction } from "#server/domains/courses/actions/update-lesson.action";
import { deleteLessonAction } from "#server/domains/courses/actions/delete-lesson.action";

export const coursesLessonRouter = {
  create: instructorProcedure
    .input(newLessonInput)
    .output(lessonSchema)
    .mutation(async ({ input, ctx }) => {
      const row = await createLessonAction(input, { actor: ctx.actor });
      flash("Lesson created");
      return row;
    }),
  update: instructorProcedure
    .input(updateLessonInput)
    .output(lessonSchema)
    .mutation(async ({ input, ctx }) => {
      const row = await updateLessonAction(input, { actor: ctx.actor });
      flash("Lesson saved");
      return row;
    }),
  delete: instructorProcedure
    .input(lessonIdInput)
    .output(lessonIdInput)
    .mutation(async ({ input, ctx }) => {
      const row = await deleteLessonAction(input, { actor: ctx.actor });
      flash("Lesson deleted");
      return row;
    }),
};
```

### Test it

Replace the generated router test. The first test is an authorization table: one case for each kind of caller, written once with `it.for`. A case holds a function, not a row, because the setup empties the tables after each test. See [Many cases in one test](../testing.md#many-cases-in-one-test).

```ts
// server/domains/courses/routers/course.router.test.ts
import { actingAs, expect, expectConstantQueries, guest, type TestCaller } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, courseFactory } from "#nuxvel/factories";
import type { CourseRow } from "#nuxvel/schema";

const instructorFactory = userFactory.state({ role: "instructor" });

describe("course router", () => {
  it.for<{ name: string; caller: (course: CourseRow) => Promise<TestCaller>; refused?: "FORBIDDEN" | "UNAUTHORIZED" }>([
    { name: "the instructor of the course", caller: async (course) => actingAs({ id: course.ownerId }).trpc },
    { name: "an admin", caller: async () => actingAs(await userFactory({ role: "admin" })).trpc },
    { name: "another instructor", caller: async () => actingAs(await instructorFactory()).trpc, refused: "FORBIDDEN" },
    { name: "a student", caller: async () => actingAs(await userFactory()).trpc, refused: "FORBIDDEN" },
    { name: "a guest", caller: async () => guest().trpc, refused: "UNAUTHORIZED" },
  ])("renames a course as $name", async ({ caller, refused }) => {
    const course = await courseFactory({ ownerId: (await instructorFactory()).id });
    const trpc = await caller(course);

    const rename = trpc.courses.course.update({ id: course.id, title: "Renamed" });

    if (refused) await expect(rename).rejects.toBeTrpcError(refused);
    else await expect(rename).resolves.toMatchObject({ title: "Renamed" });
  });

  it("finds published courses by a word of the summary, best match first", async () => {
    const sql = await courseFactory({ status: "published", title: "Postgres in practice", summary: "Indexes, queries and joins" });
    const intro = await courseFactory({ status: "published", title: "Databases", summary: "A first look at queries" });
    await courseFactory({ status: "draft", title: "Query tuning", summary: "Slow queries" });

    const page = await guest().trpc.courses.course.catalogue({ q: "queries" });

    expect(page.rows.map((row) => row.id)).toEqual([intro.id, sql.id]);
    expect(page.total).toBe(2);
  });

  it("pages through the catalogue", async () => {
    await courseFactory.count(3)({ status: "published" });

    const page = await guest().trpc.courses.course.catalogue({ page: 2, perPage: 2 });

    expect(page).toMatchObject({ page: 2, perPage: 2, total: 3, lastPage: 2 });
    expect(page.rows).toHaveLength(1);
  });

  it("lists the courses of an instructor in a constant number of queries", async () => {
    const instructor = await instructorFactory();

    await expectConstantQueries(async (size) => {
      await courseFactory.count(size)({ ownerId: instructor.id });
      await actingAs(instructor).trpc.courses.course.list();
    });
  });
});
```

- The student case gets `FORBIDDEN` from `instructorProcedure`. The case of another instructor gets `FORBIDDEN` from the policy.
- `actingAs({ id })` signs in as the user with that ID, with the role of its row.
- The search test leaves out the draft, which also matches "queries". The shorter summary ranks first.

The lesson test uploads a real file. `upload()` asks for the upload URL as that user, and sends the file to storage. Tests use the bucket of the dev services, so create it one time:

```bash
./nv storage:setup
```

```
✔ Created bucket nuxvel
✔ Uploads under nuxvel/tmp/ expire after 1 day
```

```ts
// server/domains/courses/routers/lesson.router.test.ts
import { actingAs, expect, expectRow, expectStored } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, courseFactory } from "#nuxvel/factories";
import { lessonTable } from "#nuxvel/schema";

const pdf = new File(["%PDF-1.4\n% lesson notes\n"], "notes.pdf", { type: "application/pdf" });

describe("lesson router", () => {
  it("adds a lesson with a file to a course of the instructor", async () => {
    const ada = await userFactory({ role: "instructor" });
    const course = await courseFactory({ ownerId: ada.id });
    const instructor = actingAs(ada);
    const key = await instructor.upload("courses.lesson-file", pdf);

    const lesson = await instructor.trpc.courses.lesson.create({ courseId: course.id, title: "Welcome", body: "Read the notes.", fileKey: key });

    const row = await expectRow(lessonTable, { id: lesson.id, ownerId: ada.id });
    expect(row.fileKey).toMatch(new RegExp(`^lessons/${course.id}/`));
    await expectStored(row.fileKey ?? "");
  });

  it("refuses a lesson for the course of another instructor", async () => {
    const course = await courseFactory();
    const { trpc } = actingAs(await userFactory({ role: "instructor" }));

    await expect(trpc.courses.lesson.create({ courseId: course.id, title: "Mine now", body: "No." })).rejects.toBeTrpcError("NOT_FOUND");
  });

  it("keeps the upload to instructors", async () => {
    await expect(actingAs(await userFactory()).upload("courses.lesson-file", pdf)).rejects.toMatchObject({ statusCode: 403 });
  });
});
```

Run the tests of the domain. `./nv test` takes paths, as Vitest does:

```bash
./nv test server/domains/courses
```

```
 Test Files  4 passed (4)
      Tests  13 passed (13)
```

## 4. Enrollment and progress

### The tables

The `learning` domain records what students do. An enrollment joins a student to a course, and it gets `completedAt` when the student finishes. A lesson progress row records one completed lesson. Generate the two tables:

```bash
./nv make:schema enrollment course:references student:references=user completed_at:timestamp:nullable --domain learning
./nv make:schema lesson-progress enrollment:references lesson:references --domain learning
```

```
✔ Created server/domains/learning/schema/enrollment.schema.ts
✔ Created shared/schemas/enrollment.ts
◇ Updated types (nuxt prepare) (1.2s)
✔ Created server/domains/learning/schema/lesson-progress.schema.ts
✔ Created shared/schemas/lesson-progress.ts
◇ Updated types (nuxt prepare) (1.1s)
```

A `references` field finds its table in the same domain folder, in `server/database/schema/`, in another domain of the app, or in a module. The course and the lesson tables are in the `courses` domain, so `course:references` and `lesson:references` find them there. The generator adds an index on each `references` column. One student enrolls in a course one time, and completes a lesson one time. So in `enrollment`, replace the index on `courseId` with `unique().on(table.courseId, table.studentId)`. In `lesson-progress`, replace the index on `enrollmentId` with `unique().on(table.enrollmentId, table.lessonId)`. A unique constraint has its own index, and that index also serves a query on its first column. Keep the indexes on `studentId` and `lessonId`, because no unique constraint starts with those columns:

```ts
// server/domains/learning/schema/enrollment.schema.ts
import { index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { courseTable } from "../../courses/schema/course.schema";
import { userTable } from "../../../database/schema/auth.schema";

export const enrollmentTable = pgTable("enrollment", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courseTable.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at"),
  ...timestamps(),
}, (table) => [index("enrollment_student_id_idx").on(table.studentId), unique().on(table.courseId, table.studentId)]);

export type EnrollmentRow = typeof enrollmentTable.$inferSelect;
export type NewEnrollmentRow = typeof enrollmentTable.$inferInsert;
```

```ts
// server/domains/learning/schema/lesson-progress.schema.ts
import { index, integer, pgTable, serial, unique } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { enrollmentTable } from "./enrollment.schema";
import { lessonTable } from "../../courses/schema/lesson.schema";

export const lessonProgressTable = pgTable("lesson_progress", {
  id: serial("id").primaryKey(),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollmentTable.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessonTable.id, { onDelete: "cascade" }),
  ...timestamps(),
}, (table) => [index("lesson_progress_lesson_id_idx").on(table.lessonId), unique().on(table.enrollmentId, table.lessonId)]);

export type LessonProgressRow = typeof lessonProgressTable.$inferSelect;
export type NewLessonProgressRow = typeof lessonProgressTable.$inferInsert;
```

The learning actions take their own small inputs, so delete `shared/schemas/enrollment.ts` and `shared/schemas/lesson-progress.ts`. A client must never send a `studentId`. Then write the migration and a factory:

```bash
rm shared/schemas/enrollment.ts shared/schemas/lesson-progress.ts
./nv db:generate --name learning
./nv db:migrate
./nv make:factory enrollment --domain learning
```

```
[✓] Your SQL migration file ➜ server/database/migrations/0018_learning.sql 🚀
✔ Created server/domains/learning/factories/enrollment.factory.ts
✔ Created server/domains/learning/factories/enrollment.factory.test.ts
◇ Updated types (nuxt prepare) (1.6s)
```

The factory uses the course factory of the other domain for `courseId`, and the user factory for `studentId`.

### The privacy declaration

Run the architecture rules:

```bash
./nv test:arch
```

```
✖ server/domains/learning/schema/enrollment.schema.ts: column studentId of table enrollmentTable references the user table but no defineUserData() in server/privacy/, declare it so exportUserData() and eraseUserData() find its rows
✖ 1 architecture violation
```

An enrollment is personal data of the student. `nuxvel user:export` and `nuxvel user:erase` must find it. The privacy declarations stay in `server/privacy/`, also for a table of a domain:

```ts
// server/privacy/enrollment.user-data.ts
import { enrollmentTable } from "#nuxvel/schema";

export const enrollmentUserData = defineUserData(enrollmentTable, enrollmentTable.studentId);
```

```bash
./nv test:arch
```

```
✔ All architecture rules pass
```

A lesson progress row has no user column. It belongs to an enrollment, and the foreign key deletes it with the enrollment. See [Privacy](../privacy.md).

### Events

Other parts of the app react when a student enrolls and when a student finishes a course. The learning actions must not know about that work, so they emit [domain events](../events.md):

```bash
./nv make:event enrolled enrollment_id:integer --domain learning
./nv make:event course-finished enrollment_id:integer --domain learning
```

```
✔ Created server/domains/learning/events/enrolled.event.ts
✔ Created server/domains/learning/events/enrolled.event.test.ts
◇ Updated types (nuxt prepare) (1.6s)
✔ Created server/domains/learning/events/course-finished.event.ts
✔ Created server/domains/learning/events/course-finished.event.test.ts
◇ Updated types (nuxt prepare) (1.1s)
```

```ts
// server/domains/learning/events/enrolled.event.ts
import { z } from "zod";

export const learningEnrolledEvent = defineEvent({
  payload: z.object({
    enrollmentId: z.number().int(),
  }),
});
```

The events are `learning.enrolled` and `learning.course-finished`. The payload holds only the ID of the enrollment. A listener loads the rows that it needs, so a payload never holds old data. The generated tests emit the payload `{ enrollmentId: 1 }`, an enrollment that does not exist. Chapter 6 adds a listener that runs in the transaction of the emit and writes a row that references the enrollment. That write fails for an enrollment that does not exist, so delete the two generated tests now. The action tests below emit each event with a real enrollment.

```bash
rm server/domains/learning/events/*.test.ts
```

### The actions

```bash
./nv make:action enroll course_id:integer --domain learning
./nv make:action complete-lesson lesson_id:integer --domain learning
```

```
✔ Created server/domains/learning/actions/enroll.action.ts
✔ Created server/domains/learning/actions/enroll.action.test.ts
◇ Updated types (nuxt prepare) (1.1s)
✔ Created server/domains/learning/actions/complete-lesson.action.ts
✔ Created server/domains/learning/actions/complete-lesson.action.test.ts
◇ Updated types (nuxt prepare) (1.2s)
```

A student enrolls only in a published course, one time:

```ts
// server/domains/learning/actions/enroll.action.ts
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { courseTable, enrollmentTable } from "#nuxvel/schema";

export const enrollAction = defineAction({
  input: z.object({
    courseId: z.number().int(),
  }),
  errors: {
    "learning.already-enrolled": "You are already enrolled in this course",
  },
  handler: async ({ courseId }, ctx, fail) => {
    const course = await useDb()
      .select()
      .from(courseTable)
      .where(and(eq(courseTable.id, courseId), eq(courseTable.status, "published")))
      .then(firstOrFail);

    const [enrollment] = await useDb()
      .insert(enrollmentTable)
      .values({ courseId: course.id, studentId: ctx.actor.userId ?? ctx.actor.id })
      .onConflictDoNothing()
      .returning();

    if (!enrollment) return fail("learning.already-enrolled");

    await emit("learning.enrolled", { enrollmentId: enrollment.id });

    return enrollment;
  },
});
```

- A draft course gives `NOT_FOUND`, the same as a course that does not exist.
- `onConflictDoNothing()` returns no row for a second enrollment. `fail()` then throws the typed failure `learning.already-enrolled`, which the client gets with HTTP 422 and its message. Write `return fail(...)`: then TypeScript knows that `enrollment` is set below. See [Typed failures](../actions.md#typed-failures).
- `emit()` checks the payload against the schema of the event, then runs its listeners.

The second action records a lesson. When the student has completed every lesson of the course, it sets `completedAt` and emits `learning.course-finished`, one time:

```ts
// server/domains/learning/actions/complete-lesson.action.ts
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { lessonTable, enrollmentTable, lessonProgressTable } from "#nuxvel/schema";

export const completeLessonAction = defineAction({
  input: z.object({
    lessonId: z.number().int(),
  }),
  handler: async ({ lessonId }, ctx) => {
    const lesson = await findOrFail(lessonTable, lessonId);
    const enrollment = await useDb()
      .select()
      .from(enrollmentTable)
      .where(and(eq(enrollmentTable.courseId, lesson.courseId), eq(enrollmentTable.studentId, ctx.actor.userId ?? ctx.actor.id)))
      .then(firstOrFail);

    await useDb().insert(lessonProgressTable).values({ enrollmentId: enrollment.id, lessonId }).onConflictDoNothing();

    if (enrollment.completedAt) return enrollment;

    const lessons = await useDb().select({ total: count() }).from(lessonTable).where(eq(lessonTable.courseId, lesson.courseId)).then(firstOrFail);
    const done = await useDb().select({ total: count() }).from(lessonProgressTable).where(eq(lessonProgressTable.enrollmentId, enrollment.id)).then(firstOrFail);

    if (done.total < lessons.total) return enrollment;

    const finished = await useDb()
      .update(enrollmentTable)
      .set({ completedAt: now() })
      .where(eq(enrollmentTable.id, enrollment.id))
      .returning()
      .then(firstOrFail);

    await emit("learning.course-finished", { enrollmentId: finished.id });

    return finished;
  },
});
```

The enrollment query is the tenant check: a student who is not enrolled in the course of the lesson gets `NOT_FOUND`. `now()` is the server's clock, which tests can move. See [The current time](../database.md#the-current-time).

### Who may read the lessons

The catalogue shows the titles of the lessons to everyone. The body and the file are for the instructor of the course, an admin, and the students of the course. That is a rule about a course row and the actor, so it goes in the course policy. Add a `learn` rule. It needs the enrollments of the actor, so the policy loads them in `preload`, in one query for all the rows that it checks:

```ts
// server/domains/courses/policies/course.policy.ts
import { and, eq, inArray } from "drizzle-orm";
import { enrollmentTable, courseTable } from "#nuxvel/schema";

export const coursesCoursePolicy = definePolicy(courseTable, {
  preload: async (actor, rows) => {
    const enrollments = await useDb()
      .select({ courseId: enrollmentTable.courseId })
      .from(enrollmentTable)
      .where(and(eq(enrollmentTable.studentId, actor.userId ?? actor.id), inArray(enrollmentTable.courseId, rows.map((row) => row.id))));

    return { enrolledIds: new Set(enrollments.map((row) => row.courseId)) };
  },
  rules: {
    update: (actor, row) => row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin",
    delete: (actor, row) => row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin",
    learn: (actor, row, { enrolledIds }) =>
      row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin" || enrolledIds.has(row.id),
  },
});
```

See [Preloading data for rules](../authorization.md#preloading-data-for-rules). Add the query to the lesson router. It authorizes with the ability ref `$policies.courses.course.learn`, and it signs a read URL for each file. The bucket stays private, and a read URL expires after 10 minutes:

```ts
// server/domains/courses/routers/lesson.router.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createLessonAction } from "#server/domains/courses/actions/create-lesson.action";
import { updateLessonAction } from "#server/domains/courses/actions/update-lesson.action";
import { deleteLessonAction } from "#server/domains/courses/actions/delete-lesson.action";
import { courseTable, lessonTable } from "#nuxvel/schema";

export const coursesLessonRouter = {
  forCourse: authedProcedure
    .input(z.object({ courseId: z.number().int().positive() }))
    .output(z.array(lessonWithFileSchema))
    .query(async ({ input, ctx }) => {
      const course = await findOrFail(courseTable, input.courseId);
      await authorize(ctx.actor, $policies.courses.course.learn, course);

      const lessons = await useDb().select().from(lessonTable).where(eq(lessonTable.courseId, course.id)).orderBy(lessonTable.id);

      return Promise.all(
        lessons.map(async (lesson) => ({ ...lesson, fileUrl: lesson.fileKey ? await signedReadUrl(lesson.fileKey) : null })),
      );
    }),
```

The `create`, `update` and `delete` mutations stay as they are.

### The learning router

```bash
./nv make:router learning --domain learning
```

```
✔ Created server/domains/learning/routers/learning.router.ts
◇ Updated types (nuxt prepare) (1.1s)
```

The router file has the name of its domain, so it is `trpc.learning`. Each procedure calls an action to write, and reads only the rows of the signed-in user:

```ts
// server/domains/learning/routers/learning.router.ts
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { courseTable, enrollmentTable, lessonProgressTable } from "#nuxvel/schema";
import { completeLessonAction } from "#server/domains/learning/actions/complete-lesson.action";
import { enrollAction } from "#server/domains/learning/actions/enroll.action";

const courseIdInput = z.object({ courseId: z.number().int().positive() });

export const learningRouter = {
  enroll: authedProcedure
    .input(courseIdInput)
    .output(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const enrollment = await enrollAction(input, { actor: ctx.actor });
      flash("You are enrolled");
      return { id: enrollment.id };
    }),
  completeLesson: authedProcedure
    .input(z.object({ lessonId: z.number().int().positive() }))
    .output(z.object({ finished: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const enrollment = await completeLessonAction(input, { actor: ctx.actor });
      return { finished: enrollment.completedAt !== null };
    }),
  progress: authedProcedure
    .input(courseIdInput)
    .output(z.object({ enrolled: z.boolean(), finished: z.boolean(), completedLessonIds: z.array(z.number()) }))
    .query(async ({ input, ctx }) => {
      const [enrollment] = await useDb()
        .select()
        .from(enrollmentTable)
        .where(and(eq(enrollmentTable.courseId, input.courseId), eq(enrollmentTable.studentId, ctx.user.id)));

      if (!enrollment) return { enrolled: false, finished: false, completedLessonIds: [] };

      const done = await useDb()
        .select({ lessonId: lessonProgressTable.lessonId })
        .from(lessonProgressTable)
        .where(eq(lessonProgressTable.enrollmentId, enrollment.id));

      return { enrolled: true, finished: enrollment.completedAt !== null, completedLessonIds: done.map((row) => row.lessonId) };
    }),
  dashboard: authedProcedure
    .output(z.array(z.object({ courseId: z.number(), title: z.string(), completedAt: z.date().nullable() })))
    .query(({ ctx }) =>
      useDb()
        .select({ courseId: courseTable.id, title: courseTable.title, completedAt: enrollmentTable.completedAt })
        .from(enrollmentTable)
        .innerJoin(courseTable, eq(courseTable.id, enrollmentTable.courseId))
        .where(eq(enrollmentTable.studentId, ctx.user.id))
        .orderBy(desc(enrollmentTable.id)),
    ),
};
```

### Test it

Replace the two generated action tests:

```ts
// server/domains/learning/actions/enroll.action.test.ts
import { actingAs, expect, expectEmitted, expectListenerQueued, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, courseFactory } from "#nuxvel/factories";
import { enrollmentTable } from "#nuxvel/schema";

describe("learning/enroll action", () => {
  it("enrolls a student in a published course and tells the instructor", async () => {
    const course = await courseFactory({ status: "published" });
    const student = await userFactory();

    const enrollment = await runAction("learning.enroll", { courseId: course.id }, { actingAs: student });

    await expectRow(enrollmentTable, { id: enrollment.id, courseId: course.id, studentId: student.id, completedAt: null });
    await expectEmitted("learning.enrolled", { enrollmentId: enrollment.id });
    await expectListenerQueued("learning.notify-instructor");
  });

  it("refuses a second enrollment in the same course", async () => {
    const course = await courseFactory({ status: "published" });
    const student = await userFactory();
    await runAction("learning.enroll", { courseId: course.id }, { actingAs: student });

    await expect(runAction("learning.enroll", { courseId: course.id }, { actingAs: student })).rejects.toBeActionError(
      "learning.already-enrolled",
    );
  });

  it("does not find a draft course", async () => {
    const course = await courseFactory({ status: "draft" });

    await expect(actingAs(await userFactory()).trpc.learning.enroll({ courseId: course.id })).rejects.toBeTrpcError("NOT_FOUND");
  });
});
```

The first test names the listener `learning.notify-instructor`, which chapter 5 adds. Run this file after chapter 5.

```ts
// server/domains/learning/actions/complete-lesson.action.test.ts
import { actingAs, expect, expectEmitted, expectNotEmitted, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, courseFactory, lessonFactory, enrollmentFactory } from "#nuxvel/factories";

describe("learning/complete-lesson action", () => {
  it("finishes the course with its last lesson", async () => {
    const course = await courseFactory({ status: "published" });
    const [first, last] = await lessonFactory.count(2)({ courseId: course.id, ownerId: course.ownerId });
    const enrollment = await enrollmentFactory({ courseId: course.id });
    const student = { id: enrollment.studentId };

    const afterFirst = await runAction("learning.complete-lesson", { lessonId: first?.id ?? 0 }, { actingAs: student });
    expect(afterFirst.completedAt).toBeNull();
    await expectNotEmitted("learning.course-finished");

    const afterLast = await runAction("learning.complete-lesson", { lessonId: last?.id ?? 0 }, { actingAs: student });
    expect(afterLast.completedAt).toBeInstanceOf(Date);
    await expectEmitted("learning.course-finished", { enrollmentId: enrollment.id });
  });

  it("refuses a lesson of a course that the student is not enrolled in", async () => {
    const lesson = await lessonFactory();

    await expect(actingAs(await userFactory()).trpc.learning.completeLesson({ lessonId: lesson.id })).rejects.toBeTrpcError("NOT_FOUND");
  });
});
```

`count(2)` returns an array, and `noUncheckedIndexedAccess` types each item as possibly `undefined`. Hence the `?? 0`.

The `learn` rule gets its own authorization table. Add it to the lesson router test, with the imports at the top of the file:

```ts
// server/domains/courses/routers/lesson.router.test.ts
import { actingAs, expect, expectRow, expectStored, type TestCaller } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, enrollmentFactory, courseFactory, lessonFactory } from "#nuxvel/factories";
import type { CourseRow } from "#nuxvel/schema";
import { lessonTable } from "#nuxvel/schema";
```

```ts
// server/domains/courses/routers/lesson.router.test.ts, at the end
describe("lessons of a course", () => {
  it.for<{ name: string; caller: (course: CourseRow) => Promise<TestCaller>; allowed: boolean }>([
    { name: "the instructor of the course", caller: async (course) => actingAs({ id: course.ownerId }).trpc, allowed: true },
    { name: "an admin", caller: async () => actingAs(await userFactory({ role: "admin" })).trpc, allowed: true },
    {
      name: "an enrolled student",
      caller: async (course) => actingAs({ id: (await enrollmentFactory({ courseId: course.id })).studentId }).trpc,
      allowed: true,
    },
    { name: "a student of another course", caller: async () => actingAs({ id: (await enrollmentFactory()).studentId }).trpc, allowed: false },
    { name: "another instructor", caller: async () => actingAs(await userFactory({ role: "instructor" })).trpc, allowed: false },
  ])("lets $name read the lessons: $allowed", async ({ caller, allowed }) => {
    const course = await courseFactory({ status: "published" });
    await lessonFactory({ courseId: course.id, ownerId: course.ownerId, title: "Welcome" });

    const lessons = (await caller(course)).courses.lesson.forCourse({ courseId: course.id });

    if (allowed) await expect(lessons).resolves.toMatchObject([{ title: "Welcome", fileUrl: null }]);
    else await expect(lessons).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

## 5. Listeners and notifications

The instructor wants to know about each new student. The student wants a message when the course is finished. Generate two notifications and two listeners:

```bash
./nv make:notification new-student --domain learning
./nv make:notification course-finished --domain learning
./nv make:listener notify-instructor --domain learning --event learning.enrolled
./nv make:listener announce-finish --domain learning --event learning.course-finished
```

```
✔ Created server/domains/learning/notifications/new-student.notification.ts
✔ Created server/domains/learning/notifications/new-student.notification.test.ts
◇ Updated types (nuxt prepare) (1.2s)
✔ Created server/domains/learning/notifications/course-finished.notification.ts
✔ Created server/domains/learning/notifications/course-finished.notification.test.ts
◇ Updated types (nuxt prepare) (1.1s)
✔ Created server/domains/learning/listeners/notify-instructor.listener.ts
✔ Created server/domains/learning/listeners/notify-instructor.listener.test.ts
◇ Updated types (nuxt prepare) (1.5s)
✔ Created server/domains/learning/listeners/announce-finish.listener.ts
✔ Created server/domains/learning/listeners/announce-finish.listener.test.ts
◇ Updated types (nuxt prepare) (1.1s)
```

A notification in the `database` channel is a row that the bell of the starter layout shows, with no reload:

```ts
// server/domains/learning/notifications/new-student.notification.ts
import { z } from "zod";

export const learningNewStudentNotification = defineNotification({
  schema: z.object({ courseId: z.number(), courseTitle: z.string(), studentName: z.string() }),
  via: ["database"],
  toDatabase: ({ courseId, courseTitle, studentName }) => ({
    title: "New student",
    body: `${studentName} joined ${courseTitle}`,
    url: `/teach/${courseId}`,
    icon: "i-lucide-user-plus",
  }),
});
```

```ts
// server/domains/learning/notifications/course-finished.notification.ts
import { z } from "zod";

export const learningCourseFinishedNotification = defineNotification({
  schema: z.object({ courseId: z.number(), courseTitle: z.string() }),
  via: ["database"],
  toDatabase: ({ courseId, courseTitle }) => ({
    title: "Course finished",
    body: `You finished ${courseTitle}. Your certificate is on its way.`,
    url: `/courses/${courseId}`,
    icon: "i-lucide-graduation-cap",
  }),
});
```

The listener tests below check the two notifications, so delete their generated tests:

```bash
rm server/domains/learning/notifications/*.test.ts
```

A listener is queued by default. The emit writes an outbox row in the transaction of the action, and the worker runs the listener after the commit. A rollback writes no row. A slow listener or a failed one does not slow or fail the enrollment, and the worker retries it. See [Queued listeners](../events.md#queued-listeners).

```ts
// server/domains/learning/listeners/notify-instructor.listener.ts
import { eq } from "drizzle-orm";
import { userTable, courseTable, enrollmentTable } from "#nuxvel/schema";
import { learningEnrolledEvent } from "#server/domains/learning/events/enrolled.event";

export const learningNotifyInstructorListener = defineListener({
  event: learningEnrolledEvent,
  handler: async ({ enrollmentId }) => {
    const row = await useDb()
      .select({ courseId: courseTable.id, courseTitle: courseTable.title, instructorId: courseTable.ownerId, studentName: userTable.name })
      .from(enrollmentTable)
      .innerJoin(courseTable, eq(courseTable.id, enrollmentTable.courseId))
      .innerJoin(userTable, eq(userTable.id, enrollmentTable.studentId))
      .where(eq(enrollmentTable.id, enrollmentId))
      .then(firstOrFail);

    await notify(row.instructorId, "learning.new-student", {
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      studentName: row.studentName,
    });
  },
});
```

```ts
// server/domains/learning/listeners/announce-finish.listener.ts
import { eq } from "drizzle-orm";
import { userTable, courseTable, enrollmentTable } from "#nuxvel/schema";
import { learningCourseFinishedEvent } from "#server/domains/learning/events/course-finished.event";

export const learningAnnounceFinishListener = defineListener({
  event: learningCourseFinishedEvent,
  handler: async ({ enrollmentId }) => {
    const row = await useDb()
      .select({
        courseId: courseTable.id,
        courseTitle: courseTable.title,
        studentId: enrollmentTable.studentId,
        studentEmail: userTable.email,
        completedAt: enrollmentTable.completedAt,
      })
      .from(enrollmentTable)
      .innerJoin(courseTable, eq(courseTable.id, enrollmentTable.courseId))
      .innerJoin(userTable, eq(userTable.id, enrollmentTable.studentId))
      .where(eq(enrollmentTable.id, enrollmentId))
      .then(firstOrFail);

    await notify(row.studentId, "learning.course-finished", { courseId: row.courseId, courseTitle: row.courseTitle });
  },
});
```

The second listener selects the email and the completion time too. Chapter 10 sends them to the LMS.

A queued listener runs in the worker, not in the app under test. Test what it does with `runListener()`, which runs the handler now. Replace the generated tests:

```ts
// server/domains/learning/listeners/notify-instructor.listener.test.ts
import { expectNotified, runListener } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, courseFactory, enrollmentFactory } from "#nuxvel/factories";

describe("learning.notify-instructor listener", () => {
  it("tells the instructor who joined the course", async () => {
    const instructor = await userFactory({ role: "instructor" });
    const course = await courseFactory({ ownerId: instructor.id, title: "Postgres in practice" });
    const enrollment = await enrollmentFactory({ courseId: course.id, studentId: (await userFactory({ name: "Ada Lovelace" })).id });

    await runListener("learning.notify-instructor", { enrollmentId: enrollment.id });

    await expectNotified(instructor, "learning.new-student", { body: "Ada Lovelace joined Postgres in practice" });
  });
});
```

```ts
// server/domains/learning/listeners/announce-finish.listener.test.ts
import { expectNotified, runListener } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, courseFactory, enrollmentFactory } from "#nuxvel/factories";

describe("learning.announce-finish listener", () => {
  it("tells the student that the course is finished", async () => {
    const student = await userFactory({ email: "ada@example.com" });
    const course = await courseFactory({ title: "Postgres in practice" });
    const enrollment = await enrollmentFactory({ courseId: course.id, studentId: student.id, completedAt: new Date() });

    await runListener("learning.announce-finish", { enrollmentId: enrollment.id });

    await expectNotified(student, "learning.course-finished", { title: "Course finished" });
  });
});
```

Run the tests of the two domains:

```bash
./nv test server/domains
```

```
 Test Files  9 passed (9)
      Tests  26 passed (26)
```

`./nv events` shows each event, the file that emits it and its listeners:

```bash
./nv events
```

```
EVENT                     SOURCE                                                   EMITTED BY                                                 LISTENERS
learning.course-finished  server/domains/learning/events/course-finished.event.ts  server/domains/learning/actions/complete-lesson.action.ts  learning.announce-finish (queued)
learning.enrolled         server/domains/learning/events/enrolled.event.ts         server/domains/learning/actions/enroll.action.ts           learning.notify-instructor (queued)
```

[Tutorial: build event-driven orders](./orders.md) shows events in depth: sync and queued listeners, retries, `unique` jobs and listeners that are safe to run two times.

## 6. The certificates module

### The module

The certificates are a module: a Nuxt layer in `layers/certificates/`, with its own domain, page and tests. It reacts to `learning.course-finished`. The learning domain does not know that certificates exist.

```bash
./nv make:module certificates
./nv make:schema certificate code:uuid:unique --module certificates --domain certificate
```

```
✔ Created layers/certificates/nuxt.config.ts
◇ Updated types (nuxt prepare) (1.9s)
✔ Created layers/certificates/server/domains/certificate/schema/certificate.schema.ts
✔ Created layers/certificates/shared/schemas/certificate.ts
◇ Updated types (nuxt prepare) (1.2s)
```

`layers/certificates/nuxt.config.ts` holds `export default defineNuxtConfig({})`. Nuxt extends each folder in `layers/` with no registration. The folder name `certificates` is not part of a name: the names come from the domain, `certificate`. See [Modules](../modules.md).

A certificate belongs to one enrollment and has a code that is hard to guess. The code is the address of the public certificate page. Add the enrollment by hand, and give the code a random default:

```ts
// layers/certificates/server/domains/certificate/schema/certificate.schema.ts
import { integer, pgTable, serial, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { enrollmentTable } from "../../../../../../server/domains/learning/schema/enrollment.schema";

export const certificateTable = pgTable("certificate", {
  id: serial("id").primaryKey(),
  enrollmentId: integer("enrollment_id").notNull().unique().references(() => enrollmentTable.id, { onDelete: "cascade" }),
  code: uuid("code").notNull().unique().defaultRandom(),
  ...timestamps(),
});

export type CertificateRow = typeof certificateTable.$inferSelect;
export type NewCertificateRow = typeof certificateTable.$inferInsert;
```

A schema file imports the tables that it references by a relative path, because `drizzle-kit` reads it outside Nuxt. No input writes a certificate, so delete the generated shared schema. The `drizzle.config.ts` of a new app reads the tables of each module, and the migration goes into the one migrations folder of the app:

```bash
rm -r layers/certificates/shared
./nv db:generate --name certificates
./nv db:migrate
```

```
[✓] Your SQL migration file ➜ server/database/migrations/0019_certificates.sql 🚀
```

Generate the factory:

```bash
./nv make:factory certificate --module certificates --domain certificate
```

```
✔ Created layers/certificates/server/domains/certificate/factories/certificate.factory.ts
✔ Created layers/certificates/server/domains/certificate/factories/certificate.factory.test.ts
◇ Updated types (nuxt prepare) (1.2s)
```

The command writes the two files. Its last step, `factory:sync`, finds the table and fills the definition. The `enrollmentId` column references the `enrollment` table of the app, so the definition calls the enrollment factory:

```ts
// layers/certificates/server/domains/certificate/factories/certificate.factory.ts
import { enrollmentFactory } from "#server/domains/learning/factories/enrollment.factory";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { certificateTable } from "#nuxvel/schema";

export const certificateFactory = defineFactory(certificateTable, {
  enrollmentId: async () => (await enrollmentFactory()).id,
});
```

### Issue the certificate in the transaction

Generate the listener. `make:listener --module` finds the event `learning.course-finished` in the app, and imports it:

```bash
./nv make:listener issue --module certificates --domain certificate --event learning.course-finished
```

```
✔ Created layers/certificates/server/domains/certificate/listeners/issue.listener.ts
✔ Created layers/certificates/server/domains/certificate/listeners/issue.listener.test.ts
◇ Updated types (nuxt prepare) (1.2s)
```

The generated listener logs the payload. Replace the handler, and add `sync: true`:

```ts
// layers/certificates/server/domains/certificate/listeners/issue.listener.ts
import { learningCourseFinishedEvent } from "#server/domains/learning/events/course-finished.event";
import { certificateTable } from "#nuxvel/schema";

export const certificateIssueListener = defineListener({
  event: learningCourseFinishedEvent,
  sync: true,
  handler: async ({ enrollmentId }) => {
    const [certificate] = await useDb().insert(certificateTable).values({ enrollmentId }).onConflictDoNothing().returning();

    if (certificate) await dispatchAfterCommit("certificate.mail-certificate", { certificateId: certificate.id });
  },
});
```

- `sync: true` runs the listener in the transaction of `complete-lesson`. The certificate and the `completedAt` of the enrollment commit together, or roll back together.
- A sync listener must not make network calls, such as `sendMail()`. `nuxvel test:arch` reports them. The listener queues the mail with `dispatchAfterCommit()` instead.
- `dispatchAfterCommit()` writes a row to the outbox table, in the same transaction. After the commit, the worker moves the row to the queue. When the transaction rolls back, no job runs. When the process stops after the commit, the next relay finds the row. See [The outbox](../queues.md#the-outbox).
- The unique `enrollmentId` and `onConflictDoNothing()` make a second event for the same enrollment issue nothing.

### The job and the mail

```bash
./nv make:job mail-certificate certificate_id:integer --module certificates --domain certificate
./nv make:mail issued --module certificates --domain certificate
```

```
✔ Created layers/certificates/server/domains/certificate/jobs/mail-certificate.job.ts
✔ Created layers/certificates/server/domains/certificate/jobs/mail-certificate.job.test.ts
◇ Updated types (nuxt prepare) (1.2s)
✔ Created layers/certificates/server/domains/certificate/mail/issued.mail.ts
✔ Created layers/certificates/server/domains/certificate/mail/templates/CertificateIssued.vue
✔ Created layers/certificates/server/domains/certificate/mail/issued.mail.test.ts
◇ Updated types (nuxt prepare) (1.2s)
```

The job loads the student and the course, and sends the mail. The module reads the tables of the app from `#nuxvel/schema`, which holds the tables of the app and of every module. The link in a mail must be a full URL, so it starts with `siteUrl`, the public origin of the app:

```ts
// layers/certificates/server/domains/certificate/jobs/mail-certificate.job.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { courseTable, enrollmentTable, userTable, certificateTable } from "#nuxvel/schema";

export const certificateMailCertificateJob = defineJob({
  input: z.object({
    certificateId: z.number().int(),
  }),
  handler: async ({ certificateId }) => {
    const row = await useDb()
      .select({ code: certificateTable.code, email: userTable.email, name: userTable.name, courseTitle: courseTable.title })
      .from(certificateTable)
      .innerJoin(enrollmentTable, eq(enrollmentTable.id, certificateTable.enrollmentId))
      .innerJoin(courseTable, eq(courseTable.id, enrollmentTable.courseId))
      .innerJoin(userTable, eq(userTable.id, enrollmentTable.studentId))
      .where(eq(certificateTable.id, certificateId))
      .then(firstOrFail);

    await sendMail("certificate.issued", {
      to: row.email,
      name: row.name,
      courseTitle: row.courseTitle,
      url: new URL(`/certificates/${row.code}`, useRuntimeConfig().siteUrl).href,
    });
  },
});
```

```ts
// layers/certificates/server/domains/certificate/mail/issued.mail.ts
import { h } from "vue";
import { z } from "zod";
import CertificateIssued from "./templates/CertificateIssued.vue";

export const certificateIssuedMail = defineMail({
  input: z.object({ to: z.email(), name: z.string(), courseTitle: z.string(), url: z.url() }),
  subject: ({ courseTitle }) => `Your certificate for ${courseTitle}`,
  render: (props) => h(CertificateIssued, props),
  preview: () => ({ to: "ada@example.com", name: "Ada Lovelace", courseTitle: "Postgres in practice", url: "https://academy.example.com/certificates/1" }),
});
```

```vue
<!-- layers/certificates/server/domains/certificate/mail/templates/CertificateIssued.vue -->
<script setup lang="ts">
defineProps<{ name: string; courseTitle: string; url: string }>();
</script>

<template>
  <MailLayout :preview="`You finished ${courseTitle}`">
    <EHeading>Well done, {{ name }}</EHeading>
    <EText>You finished {{ courseTitle }}. Your certificate is ready.</EText>
    <EButton :href="url" background-color="#4f46e5">View your certificate</EButton>
  </MailLayout>
</template>
```

`render` gets the input without `to`, so the address does not go into the HTML. The DevTools preview of the mail starts from `preview`. See [Mail](../mail.md).

### The certificate page

Anyone with the code can check a certificate, for example an employer. Add a public router and a page to the module:

```bash
./nv make:router certificate --module certificates --domain certificate
./nv make:page 'certificates/[code]' --module certificates
```

```
✔ Created layers/certificates/server/domains/certificate/routers/certificate.router.ts
◇ Updated types (nuxt prepare) (1.2s)
✔ Created layers/certificates/app/pages/certificates/[code].vue
```

Put the path of the page in quotes. Without them, zsh reads `[code]` as a pattern.

```ts
// layers/certificates/server/domains/certificate/routers/certificate.router.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { courseTable, enrollmentTable, userTable, certificateTable } from "#nuxvel/schema";

export const certificateRouter = {
  verify: publicProcedure
    .input(z.object({ code: z.uuid() }))
    .output(z.object({ studentName: z.string(), courseTitle: z.string(), issuedAt: z.date() }))
    .query(({ input }) =>
      useDb()
        .select({ studentName: userTable.name, courseTitle: courseTable.title, issuedAt: certificateTable.createdAt })
        .from(certificateTable)
        .innerJoin(enrollmentTable, eq(enrollmentTable.id, certificateTable.enrollmentId))
        .innerJoin(courseTable, eq(courseTable.id, enrollmentTable.courseId))
        .innerJoin(userTable, eq(userTable.id, enrollmentTable.studentId))
        .where(eq(certificateTable.code, input.code))
        .then(firstOrFail),
    ),
};
```

The output lists only the name, the course and the date. The email of the student stays private.

```vue
<!-- layers/certificates/app/pages/certificates/[code].vue -->
<script setup lang="ts">
definePageMeta({ layout: "app" });

const route = useRoute("certificates-code");
const certificate = $api.certificate.verify.useQuery(() => ({ code: route.params.code }));

useSeo({ title: "Certificate" });
</script>

<template>
  <QueryState :query="certificate">
    <template #default="{ data }">
      <UCard class="mx-auto max-w-xl text-center">
        <p class="text-sm tracking-widest text-muted uppercase">Certificate of completion</p>
        <h1 class="mt-4 text-3xl font-semibold">{{ data.studentName }}</h1>
        <p class="mt-2">finished {{ data.courseTitle }}</p>
        <p class="mt-4 text-sm text-muted">Issued <DateTime :value="data.issuedAt" /></p>
      </UCard>
    </template>
  </QueryState>
</template>
```

An unknown code renders the 404 page: a `NOT_FOUND` query during the server render sets the status of the page. See [Errors during server rendering](../frontend.md#errors-during-server-rendering).

### Test the module

Keep each test next to its file. Vitest finds the tests in `layers/` too. Replace the generated tests of the job and the mail, and add a test for the listener and the router:

```ts
// layers/certificates/server/domains/certificate/listeners/issue.listener.test.ts
import { emit, expectQueued, expectRow } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { enrollmentFactory } from "#nuxvel/factories";
import { certificateTable } from "#nuxvel/schema";

describe("certificate.issue listener", () => {
  it("issues one certificate and mails it after the commit", async () => {
    const enrollment = await enrollmentFactory({ completedAt: new Date() });

    await emit("learning.course-finished", { enrollmentId: enrollment.id });
    await emit("learning.course-finished", { enrollmentId: enrollment.id });

    const certificate = await expectRow(certificateTable, { enrollmentId: enrollment.id });
    await expectQueued("certificate.mail-certificate", { certificateId: certificate.id }, { times: 1 });
  });
});
```

`emit()` emits the event in a transaction, as an action does. The sync listener runs before it resolves. `expectQueued()` relays the outbox first, and `times: 1` proves that the second event queued no second mail.

```ts
// layers/certificates/server/domains/certificate/jobs/mail-certificate.job.test.ts
import { expect, expectMailSent, runJob } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, courseFactory, enrollmentFactory, certificateFactory } from "#nuxvel/factories";

describe("certificate.mail-certificate job", () => {
  it("mails the student a link to the certificate", async () => {
    const student = await userFactory({ name: "Ada Lovelace" });
    const course = await courseFactory({ title: "Postgres in practice" });
    const enrollment = await enrollmentFactory({ courseId: course.id, studentId: student.id });
    const certificate = await certificateFactory({ enrollmentId: enrollment.id });

    await runJob("certificate.mail-certificate", { certificateId: certificate.id });

    const mail = await expectMailSent("certificate.issued", { to: student.email, name: "Ada Lovelace", courseTitle: "Postgres in practice" });
    expect(mail.url).toMatch(new RegExp(`/certificates/${certificate.code}$`));
  });
});
```

```ts
// layers/certificates/server/domains/certificate/mail/issued.mail.test.ts
import { expect, renderMail } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("certificate.issued mail", () => {
  it("names the course and links to the certificate", async () => {
    const { subject, html, text } = await renderMail("certificate.issued", {
      to: "ada@example.com",
      name: "Ada Lovelace",
      courseTitle: "Postgres in practice",
      url: "https://academy.example.com/certificates/abc",
    });

    expect(subject).toBe("Your certificate for Postgres in practice");
    expect(html).toContain("Well done, Ada Lovelace");
    expect(text).toContain("View your certificate https://academy.example.com/certificates/abc");
  });
});
```

```ts
// layers/certificates/server/domains/certificate/routers/certificate.router.test.ts
import { randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, enrollmentFactory, certificateFactory } from "#nuxvel/factories";

describe("certificate router", () => {
  it("shows who earned a certificate, to anyone with its code", async () => {
    const enrollment = await enrollmentFactory({ studentId: (await userFactory({ name: "Ada Lovelace" })).id });
    const certificate = await certificateFactory({ enrollmentId: enrollment.id });

    await expect(guest().trpc.certificate.verify({ code: certificate.code })).resolves.toMatchObject({ studentName: "Ada Lovelace" });
  });

  it("does not find an unknown code", async () => {
    await expect(guest().trpc.certificate.verify({ code: randomUUID() })).rejects.toBeTrpcError("NOT_FOUND");
  });
});
```

```bash
./nv test layers
```

```
 Test Files  5 passed (5)
      Tests  6 passed (6)
```

`./nv events` now lists the listener of the module next to the listener of the domain:

```
learning.course-finished  server/domains/learning/events/course-finished.event.ts  server/domains/learning/actions/complete-lesson.action.ts  learning.announce-finish (queued), certificate.issue (sync)
```

## 7. The pages

### Navigation

The pages use the `app` layout of the starter, with the bell and the user menu. Add links for the three roles to its header:

```vue
<!-- app/layouts/app.vue, at the top -->
<script setup lang="ts">
const { user } = useUser();
const teaches = computed(() => user.value?.role === "instructor" || user.value?.role === "admin");
</script>
```

```vue
<!-- app/layouts/app.vue, the nav -->
        <nav aria-label="Main" class="flex items-center gap-2">
          <AppLogo />
          <UButton :to="{ name: 'courses' }" variant="ghost" color="neutral" label="Courses" />
          <UButton v-if="user" :to="{ name: 'learning' }" variant="ghost" color="neutral" label="My learning" />
          <UButton v-if="teaches" :to="{ name: 'teach' }" variant="ghost" color="neutral" label="Teach" />
        </nav>
```

A check in a page only hides a link. The procedures enforce the roles. Each link uses a route name, so the typecheck fails when a page moves.

### The catalogue

```vue
<!-- app/pages/courses/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app" });
useSeo({ title: "Courses" });

const route = useRoute();
const input = computed(() => paginationSchema.catch({}).parse(route.query));
const courses = $api.courses.course.catalogue.useQuery(input);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">Courses</h1>
    <DataTable
      :query="courses"
      :columns="[
        { accessorKey: 'title', header: 'Course' },
        { accessorKey: 'summary', header: 'Summary' },
      ]"
      search="Search courses"
    >
      <template #empty>
        <UEmpty title="No courses found" />
      </template>
      <template #title-cell="{ row }">
        <ULink :to="{ name: 'courses-id', params: { id: row.original.id } }">{{ row.original.title }}</ULink>
      </template>
    </DataTable>
  </div>
</template>
```

`<DataTable>` shows one page of the query, and the page links under it. `search` adds a search input. The page number and the search text live in the URL as `?page=` and `?q=`, so a reload and the back button keep them. The page reads them back with `paginationSchema`, and `.catch({})` turns a URL that is not valid into the first page. See [Data tables](../frontend.md#data-tables).

### The course page

The course page shows the summary and the lesson titles to everyone. A signed-in visitor gets an **Enroll** button. An enrolled student gets the lessons, with a button for each one. Put the lessons in a component, so a story can test it alone:

```vue
<!-- app/components/LessonList.vue -->
<script setup lang="ts">
const props = defineProps<{ courseId: number }>();

const queryCache = useQueryCache();
const lessons = $api.courses.lesson.forCourse.useQuery(() => ({ courseId: props.courseId }));
const progress = $api.learning.progress.useQuery(() => ({ courseId: props.courseId }));
const { mutate: complete } = useMutation({
  ...$api.learning.completeLesson.mutationOptions(),
  onSettled: () => queryCache.invalidateQueries({ key: $api.learning.key() }),
});

const done = computed(() => new Set(progress.data?.completedLessonIds));
</script>

<template>
  <section aria-labelledby="lessons" class="space-y-4">
    <h2 id="lessons" class="text-lg font-semibold">Lessons</h2>
    <UAlert
      v-if="progress.data?.finished"
      color="success"
      icon="i-lucide-graduation-cap"
      title="You finished this course"
      description="Your certificate is on its way by mail."
    />
    <QueryState :query="lessons">
      <template #default="{ data }">
        <ol class="space-y-3">
          <li v-for="lesson in data" :key="lesson.id">
            <UCard>
              <h3 class="font-medium">{{ lesson.title }}</h3>
              <p class="mt-1 text-muted">{{ lesson.body }}</p>
              <ULink v-if="lesson.fileUrl" :to="lesson.fileUrl" target="_blank" class="mt-2 inline-block">
                Open the lesson file
              </ULink>
              <div class="mt-3">
                <UBadge v-if="done.has(lesson.id)" color="success" variant="subtle" label="Completed" />
                <UButton
                  v-else
                  size="sm"
                  :label="`Mark ${lesson.title} complete`"
                  @click="complete({ lessonId: lesson.id })"
                />
              </div>
            </UCard>
          </li>
        </ol>
      </template>
    </QueryState>
  </section>
</template>
```

Each button names its lesson, so a screen reader user knows which lesson it completes. After each mutation, the component invalidates the `learning` queries, and the progress loads again.

```vue
<!-- app/pages/courses/[id].vue -->
<script setup lang="ts">
definePageMeta({ layout: "app" });

const route = useRoute("courses-id");
const courseId = computed(() => Number(route.params.id));
const queryCache = useQueryCache();
const { user } = useUser();
const course = $api.courses.course.show.useQuery(() => ({ id: courseId.value }));
const progress = $api.learning.progress.useQuery(() => ({ courseId: courseId.value }), { enabled: () => Boolean(user.value) });
const { mutate: enroll } = useMutation({
  ...$api.learning.enroll.mutationOptions(),
  onSettled: () => queryCache.invalidateQueries({ key: $api.learning.key() }),
});

useSeo(() => ({ title: course.data?.title ?? "Course" }));
</script>

<template>
  <QueryState :query="course">
    <template #default="{ data }">
      <div class="space-y-6">
        <header class="space-y-2">
          <h1 class="text-2xl font-semibold">{{ data.title }}</h1>
          <p class="text-muted">{{ data.summary }}</p>
        </header>
        <LessonList v-if="progress.data?.enrolled" :course-id="data.id" />
        <template v-else>
          <ol class="list-decimal space-y-1 pl-6">
            <li v-for="lesson in data.lessons" :key="lesson.id">{{ lesson.title }}</li>
          </ol>
          <UButton v-if="user" label="Enroll" @click="enroll({ courseId: data.id })" />
          <UButton v-else :to="{ name: 'sign-in' }" label="Sign in to enroll" />
        </template>
      </div>
    </template>
  </QueryState>
</template>
```

`enabled` keeps a guest from calling `learning.progress`, which needs a session. `useSeo()` takes a getter, so the title follows the data. A draft course gives the 404 page.

### The instructor pages

`/teach` lists the courses of the instructor and creates a new one. The form uses `useActionForm()` with the same Zod schema as the action, so the browser and the server check the same rules:

```vue
<!-- app/pages/teach/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });
useSeo({ title: "Teach" });

const courses = $api.courses.course.list.useQuery({});
const form = useActionForm(createCourseInput, $api.courses.course.create.mutationOptions(), {
  defaults: { title: "", summary: "" },
  onSuccess: (course) => navigateTo({ name: "teach-id", params: { id: course.id } }),
});
</script>

<template>
  <div class="grid gap-8 lg:grid-cols-2">
    <section aria-labelledby="your-courses" class="space-y-4">
      <h1 id="your-courses" class="text-2xl font-semibold">Your courses</h1>
      <DataTable
        :query="courses"
        :columns="[
          { accessorKey: 'title', header: 'Course' },
          { accessorKey: 'status', header: 'Status' },
        ]"
      >
        <template #empty>
          <UEmpty title="No courses yet" />
        </template>
        <template #title-cell="{ row }">
          <ULink :to="{ name: 'teach-id', params: { id: row.original.id } }">{{ row.original.title }}</ULink>
        </template>
      </DataTable>
    </section>
    <section aria-labelledby="new-course" class="space-y-4">
      <h2 id="new-course" class="text-lg font-semibold">New course</h2>
      <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="space-y-4" @submit="form.submit">
        <UFormField name="title" label="Title">
          <UInput v-model="form.state.title" class="w-full" />
        </UFormField>
        <UFormField name="summary" label="Summary">
          <UTextarea v-model="form.state.summary" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="form.pending" label="Create course" />
      </UForm>
    </section>
  </div>
</template>
```

The `auth` middleware sends a guest to the sign-in page. A student who opens `/teach` gets the 403 page, because `courses.course.list` refuses the student during the server render.

The lesson form uploads the file with `<UploadField>`. The field sends the file to storage, shows the progress and puts the `tmp/` key in `form.state.fileKey`. `field="fileKey"` shows an error of `promoteUpload()` under the field:

```vue
<!-- app/components/LessonForm.vue -->
<script setup lang="ts">
const props = defineProps<{ courseId: number }>();

const queryCache = useQueryCache();
const form = useActionForm(newLessonInput, $api.courses.lesson.create.mutationOptions(), {
  defaults: { courseId: props.courseId, title: "", body: "", fileKey: "" },
  onSuccess: async () => {
    form.state.title = "";
    form.state.body = "";
    form.state.fileKey = "";
    await queryCache.invalidateQueries({ key: $api.courses.lesson.key() });
  },
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="space-y-4" @submit="form.submit">
    <UFormField name="title" label="Title">
      <UInput v-model="form.state.title" class="w-full" />
    </UFormField>
    <UFormField name="body" label="Body">
      <UTextarea v-model="form.state.body" class="w-full" />
    </UFormField>
    <UploadField
      v-model="form.state.fileKey"
      name="courses.lesson-file"
      field="fileKey"
      label="Lesson file"
      description="A PDF or an image, up to 20 MB."
      accept="application/pdf,image/png,image/jpeg"
    />
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending" label="Add lesson" />
  </UForm>
</template>
```

The upload name `courses.lesson-file` is typed: a name that no upload has fails the typecheck. See [File uploads](../frontend.md#file-uploads).

```vue
<!-- app/pages/teach/[id].vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });

const route = useRoute("teach-id");
const courseId = computed(() => Number(route.params.id));
const queryCache = useQueryCache();
const course = $api.courses.course.byId.useQuery(() => ({ id: courseId.value }));
const lessons = $api.courses.lesson.forCourse.useQuery(() => ({ courseId: courseId.value }));
const { mutate: update } = useMutation({
  ...$api.courses.course.update.mutationOptions(),
  onSettled: () => queryCache.invalidateQueries({ key: $api.courses.course.key() }),
});

useSeo(() => ({ title: course.data?.title ?? "Course" }));
</script>

<template>
  <QueryState :query="course">
    <template #default="{ data }">
      <div class="space-y-8">
        <header class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <h1 class="text-2xl font-semibold">{{ data.title }}</h1>
            <UBadge :label="data.status" variant="subtle" />
          </div>
          <UButton v-if="data.status === 'draft'" label="Publish" @click="update({ id: data.id, status: 'published' })" />
          <UButton v-else color="neutral" variant="outline" label="Unpublish" @click="update({ id: data.id, status: 'draft' })" />
        </header>
        <section aria-labelledby="lessons" class="space-y-2">
          <h2 id="lessons" class="text-lg font-semibold">Lessons</h2>
          <QueryState :query="lessons">
            <template #empty>
              <UEmpty title="No lessons yet" description="Add the first lesson below." />
            </template>
            <template #default="{ data: rows }">
              <ol class="list-decimal space-y-1 pl-6">
                <li v-for="lesson in rows" :key="lesson.id">{{ lesson.title }}</li>
              </ol>
            </template>
          </QueryState>
        </section>
        <section aria-labelledby="new-lesson" class="space-y-4">
          <h2 id="new-lesson" class="text-lg font-semibold">New lesson</h2>
          <LessonForm :course-id="data.id" />
        </section>
      </div>
    </template>
  </QueryState>
</template>
```

### The student dashboard

```vue
<!-- app/pages/learning.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });
useSeo({ title: "My learning" });

const courses = $api.learning.dashboard.useQuery();
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">My learning</h1>
    <QueryState :query="courses">
      <template #empty>
        <UEmpty title="You are not enrolled in a course" :actions="[{ label: 'Find a course', to: { name: 'courses' } }]" />
      </template>
      <template #default="{ data }">
        <ul class="space-y-2">
          <li v-for="course in data" :key="course.courseId" class="flex items-center gap-3">
            <ULink :to="{ name: 'courses-id', params: { id: course.courseId } }">{{ course.title }}</ULink>
            <UBadge v-if="course.completedAt" color="success" variant="subtle" label="Finished" />
          </li>
        </ul>
      </template>
    </QueryState>
  </div>
</template>
```

### Seed and try it

The starter's seeder creates a demo student. Add an instructor with a published course of two lessons. `.has()` inserts the lessons for each course, with the owner of the course:

```ts
// server/seeders/database.seeder.ts
import { userFactory, courseFactory, lessonFactory } from "#nuxvel/factories";

const DEMO_EMAIL = "demo@example.com";
const TEACHER_EMAIL = "teacher@example.com";
const DEMO_PASSWORD = "demo-password";

export const databaseSeeder = defineSeeder(async () => {
  await userFactory.withPassword(DEMO_PASSWORD)({ name: "Demo User", email: DEMO_EMAIL, emailVerified: true });
  const teacher = await userFactory.withPassword(DEMO_PASSWORD)({
    name: "Grace Hopper",
    email: TEACHER_EMAIL,
    emailVerified: true,
    role: "instructor",
  });
  await courseFactory.has(2, (course) => lessonFactory.for("courseId", course).state({ ownerId: course.ownerId }))({
    ownerId: teacher.id,
    status: "published",
    title: "Postgres in practice",
    summary: "Indexes, queries and joins, one lesson at a time.",
  });
  await userFactory.count(3)();

  console.log(`Sign in as ${DEMO_EMAIL} (a student) or ${TEACHER_EMAIL} (an instructor) with the password ${DEMO_PASSWORD}`);
});
```

Change its test to match:

```ts
// tests/functional/seeders.test.ts
import { expectCount, expectRow, runSeeder, signIn } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable, lessonTable } from "#nuxvel/schema";

describe("the database seeder", () => {
  it("creates a student, an instructor and a published course with two lessons", async () => {
    await runSeeder("database");

    await expectRow(userTable, { email: "demo@example.com", role: "user" });
    await expectRow(userTable, { email: "teacher@example.com", role: "instructor" });
    await expectCount(lessonTable, 2);

    await signIn("teacher@example.com", "demo-password");
  });
});
```

```bash
./nv db:fresh --seed --force
npm run dev
```

```
Sign in as demo@example.com (a student) or teacher@example.com (an instructor) with the password demo-password
✔ Seeded database
```

Open `/courses` and find the course. Sign in as the student, enroll and complete the two lessons. The worker runs inside the dev server: Mailpit shows the certificate mail, and the bell shows "Course finished". Sign in as the instructor: the bell shows "New student".

## 8. Component tests

A component test is a story with a `play` function. `npm run test:ui` runs each story in a headless browser, with the server mocked. `mockTrpc()` answers the tRPC calls, and its types follow the app router. `trpcSpy()` answers one procedure and records each call. See [Storybook](../storybook.md).

```ts
// app/components/LessonForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, TRPCError, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, field, fillForm, page, text } from "@nuxvel/nuxt/storybook/test";
import LessonForm from "./LessonForm.vue";

const meta = { component: LessonForm, args: { courseId: 7 } } satisfies Meta<typeof LessonForm>;
export default meta;

const create = trpcSpy("courses.lesson.create", (input) => ({
  id: 1,
  ownerId: "user-1",
  courseId: input.courseId,
  title: input.title,
  body: input.body,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

export const AddsALesson: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ courses: { lesson: { create, forCourse: () => [] } } })] },
  play: async () => {
    await fillForm(page, { Title: "Welcome", Body: "Read the notes." });
    await button(page, "Add lesson").click();

    await expect(create).toHaveBeenCalledWith({ courseId: 7, title: "Welcome", body: "Read the notes.", fileKey: "" });
    await expect(field(page, "Title")).toHaveValue("");
  },
};

export const RefusedByTheServer: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        courses: {
          lesson: {
            create: () => {
              throw new TRPCError({ code: "NOT_FOUND", message: "This course is not yours" });
            },
          },
        },
      }),
    ],
  },
  play: async () => {
    await fillForm(page, { Title: "Welcome", Body: "Read the notes." });
    await button(page, "Add lesson").click();

    await expect(text(page, "This course is not yours")).toBeVisible();
  },
};
```

- `fillForm()` finds each control by its label, as the end-to-end `fillForm()` does.
- `expect(create).toHaveBeenCalledWith(...)` checks the input that the form sent. The argument has the input type of the procedure.
- `forCourse: () => []` answers the query that the form invalidates after the save.
- The second story throws as the real procedure does. The form shows the message in `formError`.

```ts
// app/components/LessonList.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, page, text } from "@nuxvel/nuxt/storybook/test";
import LessonList from "./LessonList.vue";

const meta = { component: LessonList, args: { courseId: 7 } } satisfies Meta<typeof LessonList>;
export default meta;

const lesson = { ownerId: "user-1", courseId: 7, fileUrl: null, createdAt: new Date(), updatedAt: new Date() };
const lessons = () => [
  { ...lesson, id: 1, title: "Welcome", body: "What the course covers." },
  { ...lesson, id: 2, title: "Indexes", body: "How Postgres finds a row." },
];
const complete = trpcSpy("learning.completeLesson", () => ({ finished: false }));

export const MarksALessonComplete: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        courses: { lesson: { forCourse: lessons } },
        learning: { progress: () => ({ enrolled: true, finished: false, completedLessonIds: [1] }), completeLesson: complete },
      }),
    ],
  },
  play: async () => {
    await expect(text(page, "Completed")).toBeVisible();
    await button(page, "Mark Indexes complete").click();

    await expect(complete).toHaveBeenCalledWith({ lessonId: 2 });
  },
};

export const Finished: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        courses: { lesson: { forCourse: lessons } },
        learning: { progress: () => ({ enrolled: true, finished: true, completedLessonIds: [1, 2] }) },
      }),
    ],
  },
  play: async () => {
    await expect(text(page, "You finished this course")).toBeVisible();
    await expect(button(page, "Mark Indexes complete")).toBeHidden();
  },
};
```

```bash
npm run test:ui
```

```
 Test Files  4 passed (4)
      Tests  8 passed (8)
```

The run includes the two story files of the starter. [Tutorial: build a product catalogue, component by component](./component-driven-ui.md) builds a whole UI in Storybook first. [Tutorial: testing in depth](./testing-in-depth.md) shows which layer owns which check.

## 9. A beta feature

The team tries a weekly goal on the dashboard: "You completed 2 lessons in the last 7 days." It is a beta, so a [feature flag](../flags.md) turns it on for some users only:

```bash
./nv make:flag weekly-goal --domain learning
./nv make:factory lesson-progress --domain learning
```

```
✔ Created server/domains/learning/flags/weekly-goal.flag.ts
◇ Updated types (nuxt prepare) (1.1s)
✔ Created server/domains/learning/factories/lesson-progress.factory.ts
✔ Created server/domains/learning/factories/lesson-progress.factory.test.ts
◇ Updated types (nuxt prepare) (2.4s)
```

```ts
// server/domains/learning/flags/weekly-goal.flag.ts
export const learningWeeklyGoalFlag = defineFlag({ default: false, expiresAt: "2027-03-31" });
```

The flag is `learning.weekly-goal`, off by default. After `expiresAt`, `nuxvel flags:stale` reports it, so the team removes the flag or makes the feature permanent. Add a query to the learning router. It answers `null` while the flag is off for the user, so the server never computes a feature that the user does not have:

```ts
// server/domains/learning/routers/learning.router.ts, in learningRouter
  weeklyGoal: authedProcedure.output(z.number().nullable()).query(async ({ ctx }) => {
    if (!(await flag($flags.learning.weeklyGoal))) return null;

    const lessons = await useDb()
      .select({ total: count() })
      .from(lessonProgressTable)
      .innerJoin(enrollmentTable, eq(enrollmentTable.id, lessonProgressTable.enrollmentId))
      .where(and(eq(enrollmentTable.studentId, ctx.user.id), gte(lessonProgressTable.createdAt, new Date(now().getTime() - week))))
      .then(firstOrFail);

    return lessons.total;
  }),
```

Import `count` and `gte` from `drizzle-orm`, and add the constant under `courseIdInput`:

```ts
// server/domains/learning/routers/learning.router.ts
import { and, count, desc, eq, gte } from "drizzle-orm";
```

```ts
const week = 7 * 24 * 60 * 60 * 1000;
```

`flag()` evaluates the flag for the signed-in user. On the page, `useFlag()` reads the same flag. The server evaluates it for the user, and the page gets only the result:

```vue
<!-- app/pages/learning.vue, the script -->
const courses = $api.learning.dashboard.useQuery();
const weeklyGoal = useFlag($flags.learning.weeklyGoal);
const lessonsThisWeek = $api.learning.weeklyGoal.useQuery(undefined, { enabled: weeklyGoal });
```

```vue
<!-- app/pages/learning.vue, under the heading -->
    <UAlert
      v-if="weeklyGoal && lessonsThisWeek.data !== undefined"
      icon="i-lucide-target"
      title="Weekly goal: 3 lessons"
      :description="`You completed ${lessonsThisWeek.data} lessons in the last 7 days.`"
    >
      <template #actions>
        <UBadge label="Beta" variant="subtle" />
      </template>
    </UAlert>
```

Test both states of the flag. `enableFlag()` turns the flag on for every user in the app under test:

```ts
// server/domains/learning/routers/learning.router.test.ts
import { actingAs, enableFlag, expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, enrollmentFactory, lessonProgressFactory } from "#nuxvel/factories";

describe("learning router", () => {
  it("counts the lessons of the last 7 days while the weekly goal is on", async () => {
    const student = await userFactory();
    const enrollment = await enrollmentFactory({ studentId: student.id });
    await lessonProgressFactory({ enrollmentId: enrollment.id });
    await lessonProgressFactory({ enrollmentId: enrollment.id, createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    await lessonProgressFactory();

    const { trpc } = actingAs(student);
    expect(await trpc.learning.weeklyGoal()).toBeNull();

    await enableFlag("learning.weekly-goal");
    expect(await trpc.learning.weeklyGoal()).toBe(1);
  });
});
```

The test counts one lesson. The second row is 8 days old, and the third row belongs to another student.

```bash
./nv test server/domains/learning/routers
```

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Roll the beta out with no deploy. Turn it on for every instructor, who try it first, and for 10% of the other users:

```bash
./nv flags:set learning.weekly-goal --role instructor --value true
./nv flags:set learning.weekly-goal --percentage 10
./nv flags:list
```

```
✔ learning.weekly-goal  role instructor=true
✔ learning.weekly-goal  10%, role instructor=true
NAME                  KIND  DEFAULT  TARGETING                  STATUS
learning.weekly-goal  flag  false    10%, role instructor=true  -
```

The same user always gets the same answer at the same percentage. An open page updates with no reload. [Tutorial: a status page](./status-page.md#9-a-switch-for-the-monitor) uses a flag as a switch.

## 10. The LMS integration

The school runs its own learning management system. It reads which students finished a course, and it wants a message at the moment a student finishes.

### The REST endpoint and the OpenAPI document

Turn on the OpenAPI document in `nuxt.config.ts`. The starter has the line as a comment:

```ts
// nuxt.config.ts, in nuxvel
    api: { openapi: { title: 'Academy API', version: '1.0.0', description: 'Course completions for a school LMS' } },
```

Add a procedure with `openapi` meta to the learning router. It answers at `GET /api/v1/courses/{courseId}/completions` with plain JSON:

```ts
// server/domains/learning/routers/learning.router.ts, in learningRouter
  completions: integrationProcedure
    .meta({ openapi: { method: "GET", path: "/courses/{courseId}/completions", summary: "List the students who finished a course", tags: ["learning"] } })
    .input(courseIdInput)
    .output(z.array(z.object({ email: z.string(), completedAt: z.date() })))
    .query(async ({ input, ctx }) => {
      const rows = await useDb()
        .select({ email: userTable.email, completedAt: enrollmentTable.completedAt })
        .from(enrollmentTable)
        .innerJoin(courseTable, eq(courseTable.id, enrollmentTable.courseId))
        .innerJoin(userTable, eq(userTable.id, enrollmentTable.studentId))
        .where(and(eq(courseTable.id, input.courseId), eq(courseTable.ownerId, ctx.user.id), isNotNull(enrollmentTable.completedAt)))
        .orderBy(enrollmentTable.completedAt);

      return rows.flatMap((row) => (row.completedAt ? [{ email: row.email, completedAt: row.completedAt }] : []));
    }),
```

Add the imports and the procedure builder at the top of the file:

```ts
// server/domains/learning/routers/learning.router.ts
import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";
```

```ts
const integrationProcedure = roleProcedure(["instructor", "admin"], { apiKeys: true });
```

- The LMS signs in with an API key. `roleProcedure()` refuses a key unless you pass `{ apiKeys: true }`. A key has the role of its owner, so a leaked key of a student cannot call the endpoint.
- `ctx.user` is the owner of the key. The query keeps to the courses of that instructor.
- The `.output()` schema is the response schema of the document. A `Date` arrives as an ISO string.

Export the document for the LMS team, for example to generate a client:

```bash
./nv openapi:export openapi.json
```

```
✔ Wrote the OpenAPI document to /…/academy/openapi.json
```

In development, `/api/v1/docs` shows the document as an API reference page. See [REST and OpenAPI](../openapi.md).

### An API key

Issue a key for the instructor of the seed. `tinker` opens a REPL in the server of the app, with the tables and the helpers in scope:

```bash
./nv tinker
```

```
nuxvel> (await useDb().select().from(userTable)).find((user) => user.email === "teacher@example.com").id
'4cf0a8ad-c2c1-4f3a-b00b-38a88525cb84'
```

```bash
./nv key:issue 4cf0a8ad-c2c1-4f3a-b00b-38a88525cb84 --name lms
```

```
nxk_zXdN…
✔ Issued the API key "lms" for user 4cf0a8ad-c2c1-4f3a-b00b-38a88525cb84. Store it now: it is not shown again
```

nuxvel stores only a hash of the key. Start the dev server on plain HTTP with `./nv dev --no-https`, and call the endpoint. The response lists the students who finished the course, here the demo student of chapter 7:

```bash
curl http://localhost:3000/api/v1/courses/1/completions -H "Authorization: Bearer nxk_zXdN…"
```

```
[{"email":"demo@example.com","completedAt":"2026-10-03T08:58:50.883Z"}]
```

### The outbound webhook

The LMS also wants a message when a student finishes. An outbound webhook posts the event to each endpoint that an admin adds. nuxvel signs each delivery with the Standard Webhooks headers, and retries a failed one through the queue. Add the endpoint of the LMS in `tinker`:

```
nuxvel> await addWebhookEndpoint("https://lms.example.com/hooks/academy")
{
  id: 1,
  url: 'https://lms.example.com/hooks/academy',
  secret: 'whsec_Oe+I…',
  createdAt: 2026-10-03T08:55:27.747Z
}
```

Give the secret to the LMS team one time: nuxvel does not show it again. Then send the event from the `announce-finish` listener, after the notification:

```ts
// server/domains/learning/listeners/announce-finish.listener.ts, at the end of the handler
    await sendWebhook("course.completed", {
      courseId: row.courseId,
      studentEmail: row.studentEmail,
      completedAt: row.completedAt?.toISOString() ?? null,
    });
```

`sendWebhook()` queues one `nuxvel.webhook` job for each endpoint. Send only data that every endpoint may see. See [Outbound webhooks](../webhooks.md#outbound-webhooks).

### Test the integration

`actingAs(user, { apiKey: true })` signs each call in with a new key of the user:

```ts
// tests/functional/lms-api.test.ts
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { courseFactory, enrollmentFactory, userFactory } from "#nuxvel/factories";

describe("the LMS API", () => {
  it("lists the students who finished a course of the key's instructor", async () => {
    const instructor = await userFactory({ role: "instructor" });
    const course = await courseFactory({ ownerId: instructor.id });
    const ada = await userFactory({ email: "ada@example.com" });
    await enrollmentFactory({ courseId: course.id, studentId: ada.id, completedAt: new Date("2026-09-30T10:00:00Z") });
    await enrollmentFactory({ courseId: course.id });

    const response = await actingAs(instructor, { apiKey: true }).fetch(`/api/v1/courses/${course.id}/completions`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ email: "ada@example.com", completedAt: "2026-09-30T10:00:00.000Z" }]);
  });

  it("gives another instructor's key an empty list", async () => {
    const course = await courseFactory();
    await enrollmentFactory({ courseId: course.id, completedAt: new Date() });

    const response = await actingAs(await userFactory({ role: "instructor" }), { apiKey: true }).fetch(`/api/v1/courses/${course.id}/completions`);

    expect(await response.json()).toEqual([]);
  });

  it("refuses the key of a student", async () => {
    const response = await actingAs(await userFactory(), { apiKey: true }).fetch("/api/v1/courses/1/completions");

    expect(response.status).toBe(403);
  });

  it("lists the endpoint in the OpenAPI document", async () => {
    const document = await guest().$fetch<{ info: { title: string }; paths: Record<string, object> }>("/api/v1/openapi.json");

    expect(document.info.title).toBe("Academy API");
    expect(Object.keys(document.paths)).toContain("/courses/{courseId}/completions");
  });
});
```

The webhook goes to each endpoint row, so the listener test adds one with a factory. Change the listener test:

```ts
// server/domains/learning/listeners/announce-finish.listener.test.ts
import { defineFactory } from "@nuxvel/nuxt/factories";
import { expectNotified, expectWebhookSent, runListener } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { webhookEndpointsTable } from "#nuxvel/schema";
import { userFactory, courseFactory, enrollmentFactory } from "#nuxvel/factories";

const endpointFactory = defineFactory(webhookEndpointsTable, { url: "https://lms.example.com/hooks", secret: "whsec_dGVzdA" });

describe("learning.announce-finish listener", () => {
  it("tells the student and the LMS that the course is finished", async () => {
    await endpointFactory();
    const student = await userFactory({ email: "ada@example.com" });
    const course = await courseFactory({ title: "Postgres in practice" });
    const enrollment = await enrollmentFactory({ courseId: course.id, studentId: student.id, completedAt: new Date() });

    await runListener("learning.announce-finish", { enrollmentId: enrollment.id });

    await expectNotified(student, "learning.course-finished", { title: "Course finished" });
    await expectWebhookSent("course.completed", { data: { courseId: course.id, studentEmail: "ada@example.com" } });
  });
});
```

```bash
./nv test tests/functional/lms-api.test.ts server/domains/learning/listeners
```

```
 Test Files  3 passed (3)
      Tests  6 passed (6)
```

[Tutorial: build a multi-tenant invoicing app](./invoices.md#13-api-keys-and-the-openapi-document) gives users a page for their own keys. [Tutorial: a status page](./status-page.md#8-the-monitor-webhook) receives a webhook.

## 11. Journeys in a browser

An end-to-end test drives the real app in a browser, through several pages. Keep these tests few: they check that the parts work together. The functional tests and the stories check the details. Write three journeys, one for each role:

```ts
// tests/e2e/catalogue.test.ts
import { expect, field, heading, link, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { courseFactory, lessonFactory } from "#nuxvel/factories";

describe("the catalogue in a browser", () => {
  it("finds a course by a word of its summary and opens it", async () => {
    const course = await courseFactory({ status: "published", title: "Postgres in practice", summary: "Indexes and joins" });
    await lessonFactory({ courseId: course.id, ownerId: course.ownerId, title: "Welcome" });
    await courseFactory({ status: "published", title: "Watercolour basics", summary: "Paint and paper" });

    const page = await visit({ name: "courses" });
    await field(page, "Search courses").fill("joins");
    await expect(link(page, "Watercolour basics")).toBeHidden();
    await link(page, "Postgres in practice").click();

    await expect(heading(page, "Postgres in practice")).toBeVisible();
    await expect(link(page, "Sign in to enroll")).toBeVisible();
  });
});
```

The student journey crosses the two domains and the module. `workQueue()` runs the jobs and the queued listeners, so the certificate mail is sent. `expectMailSent()` returns the input of the mail, and `visit()` opens its link:

```ts
// tests/e2e/learning.test.ts
import { actingAs, button, expect, expectMailSent, heading, text, visit, workQueue } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { courseFactory, lessonFactory, userFactory } from "#nuxvel/factories";

describe("a student in a browser", () => {
  it("enrolls, finishes the course and opens the certificate from the mail", async () => {
    const course = await courseFactory({ status: "published", title: "Postgres in practice" });
    await lessonFactory({ courseId: course.id, ownerId: course.ownerId, title: "Welcome" });
    const student = await userFactory({ name: "Ada Lovelace" });

    const page = await actingAs(student).visit({ name: "courses-id", params: { id: course.id } });
    await button(page, "Enroll").click();
    await button(page, "Mark Welcome complete").click();
    await expect(text(page, "You finished this course")).toBeVisible();

    await workQueue();
    const { url } = await expectMailSent("certificate.issued", { to: student.email });
    const certificate = await visit(url);

    await expect(heading(certificate, "Ada Lovelace")).toBeVisible();
    await expect(text(certificate, "finished Postgres in practice")).toBeVisible();
  });
});
```

The instructor journey uploads a real file. `setInputFiles` is the Playwright method of the page. The test waits for the `PUT` to storage, so the key is in the form before the submit:

```ts
// tests/e2e/teach.test.ts
import { actingAs, button, expect, expectRow, fillForm, heading, text } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { lessonTable } from "#nuxvel/schema";
import { userFactory } from "#nuxvel/factories";

describe("an instructor in a browser", () => {
  it("creates a course, adds a lesson with a file and publishes the course", async () => {
    const page = await actingAs(await userFactory({ role: "instructor" })).visit({ name: "teach" });

    await fillForm(page, { Title: "Postgres in practice", Summary: "Indexes and joins" });
    await button(page, "Create course").click();
    await expect(heading(page, "Postgres in practice")).toBeVisible();

    await fillForm(page, { Title: "Welcome", Body: "Read the notes." });
    const uploaded = page.waitForResponse((response) => response.request().method() === "PUT");
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
    await uploaded;
    await button(page, "Add lesson").click();
    await expect(page.getByRole("listitem").filter({ hasText: "Welcome" })).toBeVisible();

    await button(page, "Publish").click();
    await expect(text(page, "published")).toBeVisible();
    const lesson = await expectRow(lessonTable, { title: "Welcome" });
    expect(lesson.fileKey).toMatch(/^lessons\//);
  });
});
```

```bash
npm run test:e2e
```

```
 Test Files  4 passed (4)
      Tests  7 passed (7)
```

The run includes the starter's browser tests. Its smoke test opens each page without params, the new ones included, and checks them for errors and for accessibility. See [End-to-end tests](../testing.md#end-to-end-tests).

## 12. All the checks

```bash
npm run typecheck
npm run test:functional
npm run test:ui
npm run test:e2e
npm run test:arch
```

```
 Test Files  19 passed (19)
      Tests  43 passed (43)
```

```
 Test Files  4 passed (4)
      Tests  8 passed (8)
```

```
 Test Files  4 passed (4)
      Tests  7 passed (7)
```

```
✔ All architecture rules pass
```

`npm run typecheck` prints no errors. The types cover each name that comes from a path, for example the tRPC paths, the names of the events, jobs and uploads, and the route names of the links. `nuxvel test:arch` checks the domain folders and the module with the same rules as the rest of the app:

- A router calls an action to write.
- Each procedure has an `.output()` schema.
- A table with a user column has a privacy declaration (chapter 4).
- A sync listener makes no network call, such as the mail of chapter 6.
- A module imports another module only from its `shared/` folder.
- A test imports `expect` from the nuxvel entries.

[CLI: `nuxvel test:arch`](../cli.md#nuxvel-testarch) lists every rule. Add the five commands to CI.

## 13. Ship it

The app is ready for production. [Tutorial: ship and run an app](./ship-and-run.md) takes an app from here to a VPS, and runs it there:

- the Docker image and the release archive, and the `make:ci` workflow,
- `server:setup` and blue-green deploys, with an expand and a contract migration,
- backups, restores and the erasure log, which keeps an erased student erased after a restore,
- monitoring, error tracking, maintenance mode and `tinker` on the server.

This app needs these settings in production. See [Deploy](../deploy.md).

- `NUXT_SITE_URL`, for the links of the certificate mail.
- The storage variables, for the lesson files.
- The queue worker, for the listeners, the certificate mail and the webhooks.

## What this tutorial leaves out

- **Becoming an instructor.** An admin sets the role in the database. A real platform adds an application form and an admin page on `adminProcedure`. See [Admin procedures](../auth.md#admin-procedures).
- **Admin tools for the webhook endpoints.** This tutorial adds the endpoint in `tinker`. Write a router on `adminProcedure` with `addWebhookEndpoint()`, `listWebhookEndpoints()` and `removeWebhookEndpoint()`. See [Managing the endpoints](../webhooks.md#managing-the-endpoints).
- **Lesson order and edits.** Lessons show in the order that they were created, and the pages do not edit or delete a lesson. The mutations exist.
- **Payments.** A paid course needs a checkout and a webhook from the payment provider. [Tutorial: build event-driven orders](./orders.md) shows the events, and [Webhooks](../webhooks.md) shows the signed inbound delivery.
- **Live progress.** The instructor's bell updates live, but the pages do not. [Tutorial: build a live team chat](./realtime.md) shows channels and live queries.
- **Teams of instructors.** One instructor owns a course. [Tutorial: build a multi-tenant invoicing app](./invoices.md) shows team roles and tenant isolation.
- **Your own design and SEO.** See [Tutorial: a garden journal with its own look](./theming.md) and [Tutorial: build a public recipe site](./recipe-site.md).
