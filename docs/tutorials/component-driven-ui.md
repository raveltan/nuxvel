# Tutorial: a product catalogue, component by component

## Introduction

This tutorial builds a small admin UI for a product catalogue. Signed-in users add products, find them in a table and delete their own products. Each product has a name, an HTML description, a price, a category, an image and a published flag.

The tutorial builds the UI one component at a time, in Storybook first. You write a component, then its stories. A story is one state of the component: loading, failed, empty, saved, refused. Each story has a `play` function that acts on the component and checks the result. Only when every state of a component works does a page use it. The server stays small: one generated resource, one upload and one rule.

| Layer | Runs | This tutorial checks |
|---|---|---|
| Functional | `./nv test`, real Postgres, the built server | the procedures: the rule, the upload, the unique name, the policy |
| Component | `npm run test:ui`, one story in Chromium, MSW in place of the server | each state of each component, what it sends, the messages it shows, and the accessibility of each state |
| End-to-end | `npm run test:e2e`, a real browser on the real server | one journey across the pages, with a real session and a real upload |

Most tests in this tutorial are component tests. A story needs no database and no server, so a component test runs in a fraction of a second. See [Testing](../testing.md) for where a check goes.

You need Node.js 24, Docker, and about 60 minutes. Run every command from the app folder.

## 1. Create the app

```bash
npm create nuxvel@latest catalogue
cd catalogue
npm install
./nv services up
./nv test
```

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

The new app has Storybook already: the `.storybook/` folder, the MSW worker and the scripts. Start the dev server:

```bash
./nv db:migrate
npm run dev
```

In a second terminal, start Storybook:

```bash
npm run storybook
```

Storybook runs at `http://localhost:6006`. Keep both open. Storybook reloads a story when you save its file, so the Storybook tab is where you build each component in this tutorial.

Open the Storybook address. The sidebar has two groups:

- `components/` has the stories of your app. The starter has `UserMenu`, and `error` has the 404 page.
- `nuxvel/` has the stories of the nuxvel components: `DataTable`, `SearchInput`, `UploadField`, `ConfirmDialog`, `DateTime`, `SafeHtml`, `PresenceAvatars` and `TypingIndicator`. Use them to see what each component looks like before you use it.

Each story has three panels at the bottom. **Interactions** shows each step of the `play` function. **Accessibility** shows the axe-core result of the story. **Actions** shows the calls of each spy. The test widget in the sidebar, **Run component tests**, runs every story as a test, as `npm run test:ui` does. See [Storybook](../storybook.md).

## 2. The server

One `make:resource` command writes the table, the Zod inputs, a policy, the actions and a tRPC router. The `name` column comes from `--searchable`, so it is not in the field list. The tutorial writes the pages by hand, so the command has no `--ui`:

```bash
./nv make:resource product description:text price:integer category:enum=books,games,music published:boolean:default=false launch_on:date:nullable image_key:string:nullable --searchable name --no-openapi
```

```
✔ Created server/database/schema/product.schema.ts
✔ Created shared/schemas/product.ts
✔ Created server/policies/product.policy.ts
✔ Created server/actions/product/create-product.action.ts
✔ Created server/actions/product/update-product.action.ts
✔ Created server/actions/product/delete-product.action.ts
✔ Created server/trpc/routers/product.router.ts
✔ Created server/trpc/routers/product.router.test.ts
```

See [CLI: make:resource](../cli.md#nuxvel-makeresource-name) for each file. This chapter changes five of them, replaces the test, and adds an upload and a factory.

### The table

Give the description the `SanitizedHtml` type, and make the name unique:

```ts
// server/database/schema/product.schema.ts
import { boolean, date, index, integer, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { belongsTo, searchable, searchIndex, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const productTable = pgTable("product", {
  id: serial("id").primaryKey(),
  ownerId: belongsTo(userTable),
  description: text("description").$type<SanitizedHtml>().notNull(),
  price: integer("price").notNull(),
  category: text("category", { enum: ["books", "games", "music"] }).notNull(),
  published: boolean("published").notNull().default(false),
  launchOn: date("launch_on"),
  imageKey: varchar("image_key", { length: 255 }),
  name: text("name").notNull().unique(),
  ...searchable(["name"]),
  ...timestamps(),
}, (table) => [index("product_owner_id_idx").on(table.ownerId), searchIndex(table)]);

export type ProductRow = typeof productTable.$inferSelect;
export type NewProductRow = typeof productTable.$inferInsert;
```

`SanitizedHtml` is a `string` that only `sanitizeHtml()` makes, and it is auto-imported. With the type on the column, the action cannot store HTML that it did not clean. `.unique()` makes Postgres refuse a second product with the same name. nuxvel turns that refusal into a `ConflictError` on the `name` field, so the form can show it under the field. See [API: database errors](../api.md#database-errors).

### The shared schemas

`shared/schemas/product.ts` is the one place for the rules of the input. The form checks them in the browser, and the procedure checks them on the server. Give each rule a message for people, and keep only the columns that the list sorts and filters by:

```ts
// shared/schemas/product.ts
import { z } from "zod";

export const productIdInput = z.object({
  id: z.number().int().positive(),
});

export const createProductInput = z.object({
  name: z.string().trim().min(3, "Give the product a name of 3 or more characters").max(120),
  description: z.string().max(5000),
  price: z.number().int().positive("Give a price above 0"),
  category: z.enum(["books", "games", "music"], "Choose a category"),
  published: z.boolean().optional(),
  launchOn: z.iso.date().optional(),
  imageKey: z.string().max(255),
});

export const updateProductInput = createProductInput.omit({ imageKey: true }).partial().extend({
  id: productIdInput.shape.id,
});

export const productSchema = z.object({
  id: z.number(),
  ownerId: z.string(),
  name: z.string(),
  description: z.custom<SanitizedHtml>((value) => typeof value === "string"),
  price: z.number(),
  category: z.enum(["books", "games", "music"]),
  published: z.boolean(),
  launchOn: z.string().nullable(),
  imageKey: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const productListColumns = {
  sort: ["name", "price", "updatedAt"],
  filters: {
    category: ["books", "games", "music"],
    published: "boolean",
  },
} as const;

export const productListInput = listQuery(productListColumns);
```

- `imageKey` is a string, and `""` means no image. `<UploadField>` binds to a string, and it is `""` until the upload finishes.
- The update input leaves out `imageKey`, because only the create action moves an upload into place.
- `productSchema` is the output of each procedure. `z.custom<SanitizedHtml>()` keeps the type of the description, so `<SafeHtml>` accepts it in the browser.
- `productListColumns` names the sortable columns and the filters. `<DataTable>` and the router both read it.

The description is a plain `z.string()`, and the action cleans it on the server with `sanitizeHtml()`. [`richText()`](../validation.md#rich-text) cleans it in the schema, but a shared schema also runs in Storybook, and the HTML sanitizer does not load there. See [What this tutorial leaves out](#what-this-tutorial-leaves-out).

### The image upload

```ts
// server/uploads/product-image.upload.ts
export const productImageUpload = defineUpload({
  maxSize: "2 MB",
  allowedTypes: ["image/png", "image/jpeg", "image/webp"],
});
```

The file is the upload `product-image`. A signed-in user gets a URL to put one image of up to 2 MB into storage. See [Storage: uploads](../storage.md#uploads). Create the bucket once:

```bash
./nv storage:setup
```

### The rule

A published product needs an image. Declare the failure in the create action, and move the uploaded file out of `tmp/`:

```ts
// server/actions/product/create-product.action.ts
import { randomUUID } from "node:crypto";
import { productTable } from "#nuxvel/schema";

export const createProductAction = defineAction({
  input: createProductInput,
  errors: {
    "product.needs-image": { message: "Add an image before you publish the product", field: "imageKey" },
  },
  handler: async ({ imageKey, ...input }, ctx, fail) => {
    if (input.published && !imageKey) fail("product.needs-image");

    const storedKey = imageKey
      ? await promoteUpload({ upload: "product-image", key: imageKey, to: `products/${randomUUID()}` })
      : null;

    const row = await insertOne(productTable, {
      ...input,
      description: sanitizeHtml(input.description),
      imageKey: storedKey,
      ownerId: ctx.actor.id,
    });

    await audit("product.created", row);

    return row;
  },
});
```

`fail("product.needs-image")` throws an `ActionError` with that code. The client gets the code as `error.data.actionCode`, and chapter 4 shows the message under the image field. `promoteUpload()` checks the file in storage and moves it to a key of its own. See [Actions: typed failures](../actions.md#typed-failures) and [Storage: keeping an upload](../storage.md#keeping-an-upload).

The update action also writes the description, so it cleans it too:

```ts
// server/actions/product/update-product.action.ts
import { productTable } from "#nuxvel/schema";

export const updateProductAction = defineAction({
  input: updateProductInput,
  handler: async ({ id, description, ...fields }) => {
    const row = await findAuthorized(productTable, id, "update");

    if (description === undefined && Object.keys(fields).length === 0) return row;

    return updateOne(productTable, id, {
      ...fields,
      description: description === undefined ? undefined : sanitizeHtml(description),
    });
  },
});
```

### The router

The generated router shows each user only their own rows. In this catalogue, every user sees every product, and the policy lets only the owner delete one. Remove the owner filter from `list` and `byId`, and remove `eq` from the `drizzle-orm` import:

```ts
// server/trpc/routers/product.router.ts
export const productRouter = {
  list: authedProcedure
    .input(productListInput)
    .output(paginated(productSchema))
    .query(({ input }) =>
      paginate(
        useDb()
          .select()
          .from(productTable)
          .where(and(listWhere(productTable, input.filters), search(productTable, input.q ?? "")))
          .orderBy(...listOrderBy(productTable, input.sort), desc(searchRank(productTable, input.q ?? "")), desc(productTable.id))
          .$dynamic(),
        input,
      ),
    ),
  byId: authedProcedure
    .input(productIdInput)
    .output(productSchema)
    .query(({ input }) => findOrFail(productTable, input.id)),
```

The `create`, `update` and `delete` procedures stay as generated. Each one calls its action and sets a [flash message](../frontend.md#flash-messages).

Write the migration and run it:

```bash
./nv db:generate
./nv db:migrate
```

### A factory and the functional tests

```bash
./nv make:factory product
```

The generated factory gives the description a plain string, which is not a `SanitizedHtml`. A Faker sentence has no HTML, so it is safe to give it the type:

```ts
// server/factories/product.factory.ts
import { faker } from "@faker-js/faker";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { productTable } from "#nuxvel/schema";

export const productFactory = defineFactory(productTable, {
  description: () => faker.lorem.sentence() as SanitizedHtml,
  price: () => faker.number.int({ min: 1, max: 1000 }),
  category: "books",
  name: () => crypto.randomUUID(),
});
```

The functional tests check what only the server can check. They need an image of a few bytes. Put a 1 by 1 pixel PNG in a fixture file, so the end-to-end test can use it too:

```ts
// tests/fixtures/pixel.ts
export const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
```

Replace the generated router test:

```ts
// server/trpc/routers/product.router.test.ts
import { actingAs, expect, expectStored } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { pixelPng } from "../../../tests/fixtures/pixel";
import { productFactory, userFactory } from "#nuxvel/factories";

const draft = { name: "Harbour lights", description: "<p>A <b>calm</b> album</p>", price: 1999, category: "music", imageKey: "" } as const;

describe("product router", () => {
  it("creates a draft that every user finds", async () => {
    const created = await actingAs(await userFactory()).trpc.product.create(draft);
    const found = await actingAs(await userFactory()).trpc.product.list({ q: "harbour" });

    expect(created).toMatchObject({ name: "Harbour lights", published: false, imageKey: null });
    expect(found.rows.map((row) => row.id)).toEqual([created.id]);
  });

  it("refuses to publish a product without an image", async () => {
    await expect(
      actingAs(await userFactory()).trpc.product.create({ ...draft, published: true }),
    ).rejects.toBeActionError("product.needs-image");
  });

  it("publishes a product with its uploaded image", async () => {
    const owner = actingAs(await userFactory());
    const imageKey = await owner.upload("product-image", new File([pixelPng], "cover.png", { type: "image/png" }));

    const created = await owner.trpc.product.create({ ...draft, published: true, imageKey });

    expect(created.imageKey).toMatch(/^products\//);
    expect((await expectStored(created.imageKey ?? "")).contentType).toBe("image/png");
  });

  it("refuses a name that another product has", async () => {
    await productFactory({ name: "Harbour lights" });

    await expect(actingAs(await userFactory()).trpc.product.create(draft)).rejects.toMatchObject({ code: "CONFLICT", field: "name" });
  });

  it("refuses to delete the product of another user", async () => {
    const product = await productFactory();

    await expect(actingAs(await userFactory()).trpc.product.delete({ id: product.id })).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

```bash
./nv test server/trpc/routers/product.router.test.ts
```

```
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

- `toBeActionError()` checks the code of the failure.
- `upload(name, file)` puts a file into storage as the user, and returns its `tmp/` key. `expectStored()` checks that the promoted file is in the bucket.
- The conflict has the code `CONFLICT` and the field `name`.

The server is done. The rest of the tutorial is the UI, and it needs no more server code.

## 3. The product table

The list page shows the products in a table, with a search, sorting, pages and a **Delete** button on each row of the current user. Build it as a component, `app/components/ProductTable.vue`:

```vue
<!-- app/components/ProductTable.vue -->
<script setup lang="ts">
const route = useRoute();
const { user } = useUser();
const input = computed(() => listQueryParams(productListInput.catch({ sort: [], filters: {} }).parse(route.query)));
const products = $api.product.list.useQuery(input);

const { mutate: remove, error: removeError } = $api.product.delete.useMutation({
  optimistic: { key: () => $api.product.list.key(input.value), apply: removeRow() },
  confirm: ({ id }) => ({
    title: "Delete product?",
    description: `"${products.data.value?.rows.find((row) => row.id === id)?.name}" will be deleted.`,
    confirmLabel: "Delete",
    color: "error",
  }),
});

const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="removeError"
      color="error"
      variant="subtle"
      title="Could not delete the product."
      :description="removeError.message"
    />
    <DataTable
      :query="products"
      :columns="[
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'price', header: 'Price' },
        { accessorKey: 'updatedAt', header: 'Updated' },
        { id: 'actions', header: 'Actions' },
      ]"
      :list="productListColumns"
      search="Search products"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-package"
          title="No products yet"
          :actions="[{ label: 'Add the first product', to: { name: 'products-new' } }]"
        />
      </template>
      <template #name-cell="{ row }">
        <ULink :to="{ name: 'products-id', params: { id: row.original.id } }">{{ row.original.name }}</ULink>
      </template>
      <template #price-cell="{ row }">{{ price.format(row.original.price / 100) }}</template>
      <template #updatedAt-cell="{ row }"><DateTime :value="row.original.updatedAt" /></template>
      <template #actions-cell="{ row }">
        <UButton
          v-if="row.original.ownerId === user?.id"
          color="error"
          variant="outline"
          icon="i-lucide-trash"
          label="Delete"
          :aria-label="`Delete ${row.original.name}`"
          @click="remove({ id: row.original.id })"
        />
      </template>
    </DataTable>
  </div>
</template>
```

- `<DataTable>` shows one page of the `list` query. The page number, the search text and the sort live in the URL query. `input` reads them back from the URL with the same `productListInput` schema. See [Frontend: data tables](../frontend.md#data-tables).
- `search="Search products"` puts a [`<SearchInput>`](../frontend.md#search-input) above the table. It sends the search 300 ms after the last key.
- `<DataTable>` renders the loading and the error states of the query with [`<QueryState>`](../frontend.md#page-states). The `empty` slot replaces the empty state.
- `<DateTime>` renders the date in a `<time>` element, with the same text on the server and in the browser.
- `confirm` opens a `ConfirmDialog` before the mutation runs. `optimistic` removes the row from the cached page before the server answers, and `removeRow()` keeps `total` right. If the server refuses, the row comes back, and `removeError` holds the error. See [Frontend: optimistic updates](../frontend.md#optimistic-updates).
- `useUser()` gives the signed-in user. Only the owner of a row sees its **Delete** button.

The links go to the routes `products-new` and `products-id`. Chapter 7 adds these pages. Until then, `npm run typecheck` reports the two route names.

### The first story

```bash
./nv make:story ProductTable
```

```
✔ Created app/components/ProductTable.stories.ts
```

The generated story renders the component and checks that it rendered something. Open `components/ProductTable` in Storybook. The table shows its error state, because no server answers the `list` call. A story gives the component its server with MSW. Replace the file with one story for each state:

```ts
// app/components/ProductTable.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, mockUser, trpcSpy, TRPCError } from "@nuxvel/nuxt/storybook/mocks";
import { button, cell, dialog, expect, field, link, page, text } from "@nuxvel/nuxt/storybook/test";
import ProductTable from "./ProductTable.vue";

const meta = { component: ProductTable } satisfies Meta<typeof ProductTable>;
export default meta;

type Story = StoryObj<typeof ProductTable>;

const updatedAt = new Date("2026-03-14T09:30:00Z");
const product = {
  id: 1,
  ownerId: "user-1",
  name: "Harbour lights",
  description: "<p>A calm album</p>" as SanitizedHtml,
  price: 1999,
  category: "music" as const,
  published: false,
  launchOn: null,
  imageKey: null,
  createdAt: updatedAt,
  updatedAt,
};
const products = [product, { ...product, id: 2, ownerId: "user-2", name: "Tide tables", price: 4500 }];

function onePage(rows: typeof products, total = rows.length) {
  return { rows, page: 1, perPage: 15, total, lastPage: Math.ceil(total / 15) };
}

const ada = mockUser({ id: "user-1", name: "Ada" });

export const Loading: Story = {
  parameters: { msw: [ada, mockTrpc({ product: { list: () => new Promise(() => {}) } })] },
  play: async () => {
    await expect(page.getByRole("status")).toContainText("Loading");
  },
};

export const Failed: Story = {
  parameters: {
    msw: [ada, mockTrpc({ product: { list: () => { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The database is down" }); } } })],
  },
  play: async () => {
    await expect(text(page, "Something went wrong.")).toBeVisible();
    await expect(text(page, "The database is down")).toBeVisible();
    await expect(button(page, "Try again")).toBeVisible();
  },
};

export const Empty: Story = {
  parameters: { msw: [ada, mockTrpc({ product: { list: () => onePage([]) } })] },
  play: async () => {
    await expect(text(page, "No products yet")).toBeVisible();
    await expect(link(page, "Add the first product")).toBeVisible();
  },
};

export const Lists: Story = {
  parameters: { msw: [ada, mockTrpc({ product: { list: () => onePage(products) } })] },
  play: async () => {
    await expect(link(page, "Harbour lights")).toBeVisible();
    await expect(cell(page, "$19.99")).toBeVisible();
    await expect(page.locator('time[datetime="2026-03-14T09:30:00.000Z"]').first()).toBeVisible();
    await expect(button(page, "Delete Harbour lights")).toBeVisible();
    await expect(button(page, "Delete Tide tables")).toHaveCount(0);
  },
};

const list = trpcSpy("product.list", (input) => onePage(input?.q ? [product] : products, input?.q ? 1 : 40));

export const SearchesSortsAndPages: Story = {
  parameters: { msw: [ada, mockTrpc({ product: { list } })] },
  play: async () => {
    await field(page, "Search products").pressSequentially("harb", { delay: 50 });
    await expect(list).toHaveBeenLastCalledWith({ q: "harb" });

    await field(page, "Search products").clear();
    await button(page, "Sort by Price").click();
    await expect(list).toHaveBeenLastCalledWith({ sort: "price:asc" });

    await link(page, "Page 2").click();
    await expect(list).toHaveBeenLastCalledWith({ sort: "price:asc", page: "2" });
  },
};

const remove = trpcSpy("product.delete", () => new Promise(() => {}));

export const RemovesTheRowAtOnce: Story = {
  parameters: { msw: [ada, mockTrpc({ product: { list: () => onePage(products), delete: remove } })] },
  play: async () => {
    await button(page, "Delete Harbour lights").click();
    await button(dialog(page, "Delete product?"), "Delete").click();

    await expect(remove).toHaveBeenCalledWith({ id: 1 });
    await expect(link(page, "Harbour lights")).toHaveCount(0);
    await expect(link(page, "Tide tables")).toBeVisible();
  },
};

export const PutsTheRowBackWhenRefused: Story = {
  parameters: {
    msw: [
      ada,
      mockTrpc({
        product: {
          list: () => onePage(products),
          delete: () => { throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete this product" }); },
        },
      }),
    ],
  },
  play: async () => {
    await button(page, "Delete Harbour lights").click();
    await button(dialog(page, "Delete product?"), "Delete").click();

    await expect(text(page, "You cannot delete this product")).toBeVisible();
    await expect(link(page, "Harbour lights")).toBeVisible();
  },
};
```

Read it in four parts.

**The mocks.** `mockTrpc()` answers each tRPC call of the component in the browser. Its argument has the shape of the app router, and TypeScript checks each output against the router. That is why `product` has every field of `productSchema`, and why the description has the `SanitizedHtml` type. `mockUser()` answers the session request of `useUser()`, so the story renders signed in as Ada, with the ID `user-1`. See [Storybook: mocking the server](../storybook.md#mocking-the-server).

**The states of the query.** `Loading` gives a `list` that never answers, so the story stays in the loading state. `Failed` throws a `TRPCError`. The mock sends it in the same shape as the server, so the error state shows the message of the error and a **Try again** button. `Empty` answers with no rows, and the `empty` slot shows. `Lists` checks the price in dollars and the `<time>` element of `<DateTime>`. It also checks that only the row of Ada has a **Delete** button. The story checks the `datetime` attribute and not the text, because the text uses the time zone of the browser.

**The calls.** `trpcSpy("product.list", implementation)` answers like the implementation and records each call. `pressSequentially("harb", { delay: 50 })` types one key at a time, as a person does. A `play` function has no fake timers, so `expect(list)` tries again until the debounced call arrives or 5 seconds pass. The input of `list` is the flat URL query, so a sort is `"price:asc"` and a page is the string `"2"`. The procedure parses the strings on the server. See [Testing: typing, timers and hover](../testing.md#typing-timers-and-hover).

**The optimistic delete.** In `RemovesTheRowAtOnce`, the delete never answers. The row is gone all the same, so the story proves that the page does not wait for the server. In `PutsTheRowBackWhenRefused`, the delete throws `FORBIDDEN`. The row comes back, and the alert shows the message. The confirm dialog renders outside the story, in `document.body`, so the story finds it in `page`, with `dialog(page, "Delete product?")`.

Run the stories:

```bash
npm run test:ui -- app/components/ProductTable.stories.ts
```

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Each story is one test. A story passes when it renders, its `play` function does not throw and axe-core finds no violation. See [chapter 6](#6-accessibility-in-each-story).

## 4. The product form

The new page has a form with one control of each Nuxt UI kind. The controls are a text input, a text area, a number input, a select, a date input, a file field and a switch. Build it on `useActionForm()` with the shared create schema:

```vue
<!-- app/components/ProductForm.vue -->
<script setup lang="ts">
const emit = defineEmits<{ created: [product: { id: number }] }>();

const form = useActionForm($api.product.create, {
  defaults: { name: "", description: "", price: undefined, category: undefined, published: false, launchOn: undefined, imageKey: "" },
  onSuccess: (product) => emit("created", product),
});

const categories = [
  { label: "Books", value: "books" },
  { label: "Games", value: "games" },
  { label: "Music", value: "music" },
];
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="space-y-4" @submit="form.submit">
    <UFormField name="name" label="Name" eager-validation>
      <UInput v-model="form.state.name" class="w-full" />
    </UFormField>
    <UFormField name="description" label="Description" help="Simple HTML, for example <p> and <b>.">
      <UTextarea v-model="form.state.description" class="w-full" />
    </UFormField>
    <UFormField name="price" label="Price in cents">
      <template #hint>
        <UTooltip text="1999 is $19.99">
          <UButton icon="i-lucide-info" color="neutral" variant="ghost" size="xs" aria-label="About the price" />
        </UTooltip>
      </template>
      <UInput v-model.number="form.state.price" type="number" class="w-full" />
    </UFormField>
    <UFormField name="category" label="Category">
      <USelect v-model="form.state.category" :items="categories" class="w-full" />
    </UFormField>
    <UFormField name="launchOn" label="Launch date">
      <UInput v-model="form.state.launchOn" type="date" class="w-full" />
    </UFormField>
    <UploadField v-model="form.state.imageKey" name="product-image" field="imageKey" label="Image" accept="image/png,image/jpeg,image/webp" />
    <UFormField name="published">
      <USwitch v-model="form.state.published" label="Published" />
    </UFormField>
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending" label="Create product" />
  </UForm>
</template>
```

- `useActionForm($api.product.create, ...)` checks the state with the shared schema of the action before it sends anything. Each message shows under the `<UFormField>` of its field. See [Frontend: forms](../frontend.md#forms).
- The `field` of `product.needs-image` in the action puts its message under the `imageKey` field. The `<UFormField>` inside `<UploadField>` shows the message, because `field="imageKey"` gives it the field name.
- `eager-validation` on the name field checks the name while the user types, not only after the field loses focus.
- The price has a help button in a `UTooltip`. An icon button has no text, so `aria-label` gives it a name.
- This tutorial was not run again in its app after `field` was added to `<UploadField>`.
- `<UploadField>` sends the chosen file to the `product-image` upload, shows the progress and then sets `imageKey` to the `tmp/` key. See [Frontend: file uploads](../frontend.md#file-uploads).
- The component emits `created` with the new product. The page decides where to go next.

```bash
./nv make:story ProductForm
```

Replace the story with one story for each outcome of a submit, and two for the behaviour while the user types and points:

```ts
// app/components/ProductForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { ActionError, ConflictError, mockTrpc, RateLimitedError, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, field, fillForm, page, text } from "@nuxvel/nuxt/storybook/test";
import ProductForm from "./ProductForm.vue";

const meta = { component: ProductForm } satisfies Meta<typeof ProductForm>;
export default meta;

type Story = StoryObj<typeof ProductForm>;

const create = trpcSpy("product.create", (input) => ({
  id: 7,
  ownerId: "user-1",
  name: input.name,
  description: input.description as SanitizedHtml,
  price: input.price,
  category: input.category,
  published: input.published ?? false,
  launchOn: input.launchOn ?? null,
  imageKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const draft = { Name: "Harbour lights", "Price in cents": "1999", Category: "Music" };

export const Creates: Story = {
  parameters: { msw: [mockTrpc({ product: { create } })] },
  play: async () => {
    await fillForm(page, { ...draft, Description: "<p>A calm album</p>", "Launch date": "2026-11-01", Published: false });
    await button(page, "Create product").click();

    await expect(create).toHaveBeenCalledWith({
      name: "Harbour lights",
      description: "<p>A calm album</p>",
      price: 1999,
      category: "music",
      published: false,
      launchOn: "2026-11-01",
      imageKey: "",
    });
    await expect(create).toHaveBeenCalledTimes(1);
  },
};

export const StopsAnEmptyForm: Story = {
  parameters: { msw: [mockTrpc({ product: { create } })] },
  play: async () => {
    await button(page, "Create product").click();

    await expect(text(page, "Give the product a name of 3 or more characters")).toBeVisible();
    await expect(text(page, "Choose a category")).toBeVisible();
    await expect(field(page, "Name")).toHaveAttribute("aria-invalid", "true");
    await expect(create).not.toHaveBeenCalled();
  },
};

export const ChecksTheNameWhileYouType: Story = {
  play: async () => {
    await field(page, "Name").pressSequentially("Ha", { delay: 50 });
    await expect(text(page, "Give the product a name of 3 or more characters")).toBeVisible();

    await field(page, "Name").pressSequentially("r");
    await expect(text(page, "Give the product a name of 3 or more characters")).toHaveCount(0);
  },
};

export const ExplainsThePrice: Story = {
  play: async () => {
    await button(page, "About the price").hover();
    await expect(text(page, "1999 is $19.99")).toBeVisible();

    await button(page, "About the price").unhover();
    await expect(text(page, "1999 is $19.99")).toHaveCount(0);
  },
};

export const NameTaken: Story = {
  parameters: {
    msw: [mockTrpc({ product: { create: () => { throw new ConflictError("A product with this name exists", { field: "name" }); } } })],
  },
  play: async () => {
    await fillForm(page, draft);
    await button(page, "Create product").click();

    await expect(text(page, "A product with this name exists")).toBeVisible();
    await expect(field(page, "Name")).toHaveAttribute("aria-invalid", "true");
  },
};

export const NeedsAnImage: Story = {
  parameters: {
    msw: [mockTrpc({ product: { create: () => { throw new ActionError("product.needs-image", "Add an image before you publish the product", "product.create-product", "imageKey"); } } })],
  },
  play: async () => {
    await fillForm(page, { ...draft, Published: true });
    await button(page, "Create product").click();

    await expect(text(page, "Add an image before you publish the product")).toBeVisible();
  },
};

export const TooManyProducts: Story = {
  parameters: {
    msw: [mockTrpc({ product: { create: () => { throw new RateLimitedError("Too many new products. Try again in a minute.", { retryAfter: 60 }); } } })],
  },
  play: async () => {
    await fillForm(page, draft);
    await button(page, "Create product").click();

    await expect(text(page, "Too many new products. Try again in a minute.")).toBeVisible();
  },
};
```

**`fillForm` across the controls.** `fillForm(page, { Label: value })` finds each control by its label and fills it in the way that the control needs. A string goes into a text input, a text area or the number input. `Category: "Music"` opens the `USelect` and chooses the option with that label. `"Launch date": "2026-11-01"` sets the date input. `Published: false` sets the `USwitch`. The `Creates` story then checks the exact input that the form sent. The price is a number, the category is its value `"music"`, and `imageKey` is `""` because no file was chosen.

**The schema in the browser.** `StopsAnEmptyForm` submits with no values. The messages of the shared schema show, `aria-invalid` marks the name, and the spy has no call. `ChecksTheNameWhileYouType` types two letters. The message shows at once, and the third letter removes it.

**Hover.** `ExplainsThePrice` points at the help button with `hover()`, and `expect` tries again until the tooltip opens. `unhover()` moves the pointer away, and the tooltip closes. A Nuxt UI tooltip renders its text two times, one copy for the eye and one for screen readers. `text()` skips the copy with `aria-hidden="true"`, so it finds one element.

**The errors of the server.** Each story throws the error that the real procedure throws, from `@nuxvel/nuxt/storybook/mocks`:

| Story | Error | Where the message shows |
|---|---|---|
| `NameTaken` | `ConflictError(message, { field: "name" })`, as the unique name gives | under **Name** |
| `NeedsAnImage` | `ActionError("product.needs-image", message, action, "imageKey")`, as `fail()` gives | under the image field, through the `field` of the failure |
| `TooManyProducts` | `RateLimitedError(message, { retryAfter })`, as a rate limit gives | in the `UAlert` of `form.formError` |

The mock adds the same `data` to the answer as the server, from the same function. So the form gets `data.fields` or `data.actionCode` as in production. See [Storybook: mocking the server](../storybook.md#mocking-the-server).

```bash
npm run test:ui -- app/components/ProductForm.stories.ts
```

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

## 5. The product details

The details page shows one product. The description is HTML, so it renders with `<SafeHtml>`:

```vue
<!-- app/components/ProductDetails.vue -->
<script setup lang="ts">
const props = defineProps<{ id: number }>();

const product = $api.product.byId.useQuery(() => ({ id: props.id }));
const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
</script>

<template>
  <QueryState :query="product">
    <template #error="{ error }">
      <UAlert color="error" variant="subtle" title="Could not open the product." :description="error.message" />
    </template>
    <template #default="{ data }">
      <article class="space-y-4">
        <h1 class="text-2xl font-semibold">{{ data.name }}</h1>
        <p>
          {{ price.format(data.price / 100) }} · {{ data.published ? "Published" : "Draft" }} · Updated
          <DateTime :value="data.updatedAt" :options="{ dateStyle: 'long' }" />
        </p>
        <SafeHtml :html="data.description" class="prose" />
      </article>
    </template>
  </QueryState>
</template>
```

- `<QueryState>` renders the loading state until the first answer. The `error` slot replaces the default error state with a message for this page.
- `<SafeHtml :html>` takes only a `SanitizedHtml`. A plain `string` fails `npm run typecheck`. The type comes from `productSchema`, so the component never renders HTML that the server did not clean. See [Frontend: rendering HTML](../frontend.md#rendering-html).
- `<DateTime>` takes `Intl.DateTimeFormat` options, here a long date.

```bash
./nv make:story ProductDetails
```

The component has a required `id` prop, so the stories give it in `args` of the meta. The story type is then `StoryObj<typeof meta>`, which knows that `id` is set:

```ts
// app/components/ProductDetails.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, TRPCError } from "@nuxvel/nuxt/storybook/mocks";
import { expect, heading, page, text } from "@nuxvel/nuxt/storybook/test";
import ProductDetails from "./ProductDetails.vue";

const meta = { component: ProductDetails, args: { id: 1 } } satisfies Meta<typeof ProductDetails>;
export default meta;

type Story = StoryObj<typeof meta>;

const product = {
  id: 1,
  ownerId: "user-1",
  name: "Harbour lights",
  description: "<p>A <b>calm</b> album for long evenings.</p>" as SanitizedHtml,
  price: 1999,
  category: "music" as const,
  published: true,
  launchOn: null,
  imageKey: "products/1",
  createdAt: new Date("2026-03-14T09:30:00Z"),
  updatedAt: new Date("2026-03-14T09:30:00Z"),
};

export const Loading: Story = {
  parameters: { msw: [mockTrpc({ product: { byId: () => new Promise(() => {}) } })] },
  play: async () => {
    await expect(page.getByRole("status")).toContainText("Loading");
  },
};

export const Shows: Story = {
  parameters: { msw: [mockTrpc({ product: { byId: () => product } })] },
  play: async () => {
    await expect(heading(page, "Harbour lights")).toBeVisible();
    await expect(page.locator("article p").first()).toContainText("$19.99 · Published");
    await expect(page.locator("article b")).toHaveText("calm");
  },
};

export const NotFound: Story = {
  parameters: {
    msw: [mockTrpc({ product: { byId: () => { throw new TRPCError({ code: "NOT_FOUND", message: "The product does not exist" }); } } })],
  },
  play: async () => {
    await expect(text(page, "Could not open the product.")).toBeVisible();
    await expect(text(page, "The product does not exist")).toBeVisible();
  },
};
```

`Shows` checks that `<b>` in the description is a real element, not escaped text. `NotFound` throws `NOT_FOUND`, the code that `findOrFail()` gives for a missing row.

```bash
npm run test:ui -- app/components/ProductDetails.stories.ts
```

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## 6. Accessibility in each story

`@storybook/addon-a11y` runs axe-core after each story, and a violation fails the story. The stories need no code for this. To see a failure, remove `aria-label="About the price"` from the help button in `ProductForm.vue`, and run the form stories again:

```bash
npm run test:ui -- app/components/ProductForm.stories.ts
```

```
 FAIL  |ui (chromium)| app/components/ProductForm.stories.ts > Creates
Error:
Click to debug the error directly in Storybook: http://localhost:6006/?path=/story/components-productform--creates&addonPanel=storybook/interactions/panel

expect(received).toHaveNoViolations(expected)

Expected the HTML found at $('.text-xs') to have no violations:

<button type="button" data-slot="base" data-state="closed" data-grace-area-trig...="" class="rounded-md font-medi...">

Received:

"Buttons must have discernible text (button-name)"
```

Every story of the form fails, because the button is in each state. A screen reader announces the button as "button" and nothing more. Put the `aria-label` back, and the stories pass again. The Accessibility panel of Storybook shows the same result while you work on the component. See [Storybook: accessibility](../storybook.md#accessibility).

## 7. Debug a story in Storybook

A failed story prints a link, as above: `Click to debug the error directly in Storybook`. The link opens the story with the Interactions panel. The link uses port 6006, so start Storybook alone for it:

```bash
npm run storybook
```

The Interactions panel lists each step of the `play` function: each `fill`, `click`, `hover` and `expect`, with the step that failed in red. The controls of the panel go back one step and run the story again. The same panel is in the Storybook tab that `npm run storybook` opened. See [Storybook: debug a failed story](../storybook.md#debug-a-failed-story).

## 8. The pages

Each component now works in every state. The pages only place them. All three pages need a signed-in user, and they use the `app` layout of the starter:

```vue
<!-- app/pages/products/index.vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

useSeo({ title: "Products" });
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Products</h1>
      <UButton :to="{ name: 'products-new' }" icon="i-lucide-plus" label="New product" />
    </div>
    <ProductTable />
  </div>
</template>
```

```vue
<!-- app/pages/products/new.vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

useSeo({ title: "New product" });
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">New product</h1>
    <ProductForm @created="(product) => navigateTo({ name: 'products-id', params: { id: product.id } })" />
  </div>
</template>
```

```vue
<!-- app/pages/products/[id].vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const route = useRoute("products-id");

useSeo({ title: "Product" });
</script>

<template>
  <div class="max-w-xl space-y-6">
    <ULink :to="{ name: 'products' }">All products</ULink>
    <ProductDetails :id="Number(route.params.id)" />
  </div>
</template>
```

The route names come from the paths: `products`, `products-new` and `products-id`. `useRoute("products-id")` types `route.params.id`. The links of the table now point at pages that exist, so the typecheck passes:

```bash
npm run typecheck
```

Open `/products` in the app. Sign in with an account from `/sign-up`, or run `./nv db:seed` and sign in as the demo user.

## 9. One journey end to end

The component tests check each state with a fake server. One end-to-end test checks that the parts work together. It uses the real session, the real upload to storage, the real procedures and the navigation between the pages:

```ts
// tests/e2e/products.test.ts
import { actingAs, button, dialog, expect, expectAccessible, field, fillForm, heading, link, toast } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";
import { pixelPng } from "../fixtures/pixel";

describe("the product pages", () => {
  it("creates, finds and deletes a product", async () => {
    const page = await actingAs(await userFactory()).visit({ name: "products-new" });

    await fillForm(page, { Name: "Harbour lights", Description: "<p>A <b>calm</b> album</p>", "Price in cents": "1999", Category: "Music", Published: true });
    const uploaded = page.waitForResponse((response) => response.request().method() === "PUT");
    await page.locator('input[type="file"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: pixelPng });
    await uploaded;
    await button(page, "Create product").click();

    await expect(heading(page, "Harbour lights")).toBeVisible();
    await toast(page, "Product created").dismiss();
    await expectAccessible(page);

    await link(page, "All products").click();
    await field(page, "Search products").fill("harbour");
    await button(page, "Delete Harbour lights").click();
    await expectAccessible(page);
    await button(dialog(page, "Delete product?"), "Delete").click();

    await expect(link(page, "Harbour lights")).toHaveCount(0);
    await expect(page.getByText("No products yet")).toBeVisible();
  });
});
```

- `actingAs(user).visit({ name: "products-new" })` signs the user in and opens the page by its typed route name.
- `fillForm` is the same helper as in the stories, with the same labels.
- `setInputFiles` gives the file input the PNG of the fixture. The test waits for the `PUT` to storage, so `imageKey` holds the key before the submit.
- The `Product created` toast is the flash message of the `create` procedure. Close it before `expectAccessible()`.

The test does not check each message of the form again. The stories own those checks.

```bash
npm run test:e2e
```

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

The second file is the starter's `tests/e2e/home.test.ts`. Its smoke test, `expectNoSmoke()`, opens each route without params, so it now also opens `/products` and `/products/new` and checks them with axe.

## 10. Run every check

```bash
npm run typecheck
./nv test
npm run test:ui
npm run test:e2e
npm run test:arch
```

```
 Test Files  4 passed (4)
      Tests  11 passed (11)

 Test Files  5 passed (5)
      Tests  21 passed (21)

 Test Files  2 passed (2)
      Tests  5 passed (5)

✔ All architecture rules pass
```

`./nv test` runs the router test, the factory test and the two starter files. `npm run test:ui` runs the 17 stories of this tutorial and the 4 stories of the starter. `npm run test:arch` also checks that each test and each story imports `expect` from its nuxvel entry: `@nuxvel/nuxt/testing` in a test, `@nuxvel/nuxt/storybook/test` in a story.

## What this tutorial leaves out

- An edit form. `ProductForm` creates only. An edit form takes `updateProductInput` and a `defaults` with the `id` of the row, and `useActionForm()` then asks before the user leaves with unsaved changes. See [Frontend: unsaved changes](../frontend.md#unsaved-changes).
- The image on the details page. Sign a read URL with `signedReadUrl()` in the procedure, and add the storage origin to `img-src`. See [Storage: showing a stored file](../storage.md#showing-a-stored-file).
- `richText()` in the shared schema. In this version of nuxvel, a component that imports `richText()` through a shared schema does not load in Storybook. The HTML sanitizer does not load there. The action calls `sanitizeHtml()` on the server in its place.
