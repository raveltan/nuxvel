import { join } from "node:path";
import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { fail } from "../ui/fail.ts";
import { toCamelCase, toPascalCase, toSentenceCase } from "./case.ts";
import { type Field, fieldControl, fieldDefault, fieldSample, referenceFactory } from "./fields.ts";
import { actionFiles } from "./make-action.ts";
import { policyFiles } from "./make-policy.ts";
import { schemaFiles, tableFile, type TableOptions } from "./make-schema.ts";
import { definitionExport, domainFile, importFrom, kebabName, registeredName, schemaFile } from "./names.ts";

export interface CrudOptions extends TableOptions {
  openapi?: boolean;
  ui?: boolean;
}

function routerFile(name: string, paths: AppPaths, domain?: string) {
  return domainFile(paths.serverDir, "trpc/routers", name, "router", domain);
}

export function routerFiles(name: string, paths: AppPaths, domain?: string): GeneratedFile[] {
  kebabName(name, "blog-post");

  return [
    {
      path: `${routerFile(name, paths, domain)}.ts`,
      template: "router.ts.txt",
      values: { exportName: definitionExport(registeredName(name, domain), "router") },
    },
  ];
}

function objectLiteral(entries: string[]) {
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

function mutation(procedure: string, input: string, action: string, message: string, meta: string, output: string) {
  return [
    `  ${procedure}: authedProcedure${meta}`,
    `    .input(${input})${output}`,
    "    .mutation(async ({ input }) => {",
    `      const row = await ${action}(input);`,
    `      flash("${message}");`,
    "      return row;",
    "    }),",
    "",
  ].join("\n");
}

function crudActionNames(name: string) {
  return { create: `create-${name}`, update: `update-${name}`, delete: `delete-${name}`, restore: `restore-${name}` };
}

function routerValues(name: string, options: CrudOptions, actionsImport: string, actions: ReturnType<typeof crudActionNames>) {
  const table = toCamelCase(name);
  const title = toSentenceCase(name);
  const columns = options.searchable ?? [];
  const searching = columns.length > 0;
  const q = 'input.q ?? ""';
  const owned = `eq(${table}Table.ownerId, ctx.user.id)`;
  const conditions = [
    owned,
    `listWhere(${table}Table, input.filters)`,
    ...(searching ? [`search(${table}Table, ${q})`] : []),
    ...(options.softDeletes ? [`notTrashed(${table}Table)`] : []),
  ];
  const where = `and(${conditions.join(", ")})`;
  const lower = title.toLowerCase();
  const article = /^[aeiou]/.test(lower) ? "an" : "a";
  const base = `/${registeredName(name, options.domain).replace(".", "/")}`;
  const meta = (method: string, path: string, summary: string) =>
    !options.openapi
      ? ""
      : method === "GET" || method === "POST"
        ? `\n    .openapi({ path: "${base}${path}", summary: "${summary}", tags: ["${name}"] })`
        : `\n    .meta({ openapi: { method: "${method}", path: "${base}${path}", summary: "${summary}", tags: ["${name}"] } })`;
  const output = (schema: string) => `\n    .output(${schema})`;
  const rowOutput = output(`${table}Schema`);

  return {
    drizzleImports: "and, desc, eq",
    deleteActionImports:
      `import { ${definitionExport(actions.delete, "action")} } from "${actionsImport}/${actions.delete}.action";\n` +
      (options.softDeletes ? `import { ${definitionExport(actions.restore, "action")} } from "${actionsImport}/${actions.restore}.action";\n` : ""),
    listMeta: meta("GET", "", `List ${lower} rows`),
    listOutput: output(`paginated(${table}Schema)`),
    listWhere: `\n          .where(${where})`,
    listOrder: searching ? `desc(searchRank(${table}Table, ${q})), desc(${table}Table.id)` : `desc(${table}Table.id)`,
    byIdWhere: `and(${[`eq(${table}Table.id, input.id)`, owned, ...(options.softDeletes ? [`notTrashed(${table}Table)`] : [])].join(", ")})`,
    byIdMeta: meta("GET", "/{id}", `Get ${article} ${lower}`),
    byIdOutput: rowOutput,
    mutationProcedures:
      mutation("create", `create${toPascalCase(name)}Input`, definitionExport(actions.create, "action"), `${title} created`, meta("POST", "", `Create ${article} ${lower}`), rowOutput) +
      mutation("update", `update${toPascalCase(name)}Input`, definitionExport(actions.update, "action"), `${title} saved`, meta("PATCH", "/{id}", `Update ${article} ${lower}`), rowOutput) +
      mutation("delete", `${table}IdInput`, definitionExport(actions.delete, "action"), `${title} deleted`, meta("DELETE", "/{id}", `Delete ${article} ${lower}`), output(`${table}IdInput`)) +
      (options.softDeletes
        ? mutation("restore", `${table}IdInput`, definitionExport(actions.restore, "action"), `${title} restored`, meta("POST", "/{id}/restore", `Restore ${article} ${lower}`), rowOutput)
        : ""),
  };
}

function parentChecks(fields: Field[], update: boolean) {
  return fields
    .flatMap(({ key, nullable, reference }) => {
      if (!reference?.owned) return [];

      const value = `${update ? "fields" : "input"}.${key}`;
      const query = [
        "await useDb()",
        "  .select()",
        `  .from(${reference.table})`,
        `  .where(and(eq(${reference.table}.id, ${value}), eq(${reference.table}.ownerId, ctx.actor.userId ?? ctx.actor.id)))`,
        "  .then(firstOrFail);",
      ];
      const condition = update ? `${value} && ${value} !== row.${key}` : nullable ? value : undefined;
      const lines = condition ? [`if (${condition}) {`, ...query.map((line) => `  ${line}`), "}"] : query;

      return [lines.map((line) => `    ${line}\n`).join("")];
    })
    .join("\n");
}

function testValues(name: string, options: CrudOptions, trpcPath: string, router: string) {
  const table = toCamelCase(name);
  const columns = (options.searchable ?? []).map(toCamelCase);
  const fields = options.fields ?? [];
  const samples = fields.map(
    (field) =>
      `${field.key}: ${field.reference?.owned ? `(await ${referenceFactory(field.reference)}({ ownerId: user.id })).id` : fieldSample(field)}`,
  );
  const references = new Map(
    fields.flatMap(({ reference }) => (reference && reference.table !== "userTable" ? [[reference.table, reference]] : [])),
  );
  const [firstColumn] = columns;

  for (const reference of references.values()) {
    if (reference.factory || reference.requiredReferences.length === 0) continue;

    fail(`The test cannot make a row of ${reference.table}: it needs a value for ${reference.requiredReferences.join(", ")}`, {
      hint: "Create a factory for that table first with nuxvel make:factory, then run this command again",
    });
  }

  const tests: string[] = [];

  if (firstColumn !== undefined) {
    tests.push(`
  it("finds rows by their search text", async () => {
    const owner = await userFactory();
    const match = await ${table}Factory({ ownerId: owner.id, ${firstColumn}: "Quarterly report" });
    await ${table}Factory({ ownerId: owner.id, ${firstColumn}: "Holiday plan" });

    const found = await actingAs(owner).trpc.${trpcPath}.list({ q: "quarterly" });

    expect(found.rows.map((row) => row.id)).toEqual([match.id]);
  });
`);
  }

  if (options.softDeletes) {
    tests.push(`
  it("deletes and restores a row, hiding it from the list while it is trashed", async () => {
    const owner = await userFactory();
    const row = await ${table}Factory.for("ownerId", owner)();

    await actingAs(owner).trpc.${trpcPath}.delete({ id: row.id });
    await expectSoftDeleted(${table}Table, { id: row.id });
    const listed = await actingAs(owner).trpc.${trpcPath}.list();

    expect(listed.rows.map((listedRow) => listedRow.id)).not.toContain(row.id);

    await actingAs(owner).trpc.${trpcPath}.restore({ id: row.id });
    await expectRow(${table}Table, { id: row.id, deletedAt: null });
  });
`);
  } else {
    tests.push(`
  it("deletes a row for its owner only", async () => {
    const owner = await userFactory();
    const row = await ${table}Factory.for("ownerId", owner)();

    await expect(actingAs(await userFactory()).trpc.${trpcPath}.delete({ id: row.id })).rejects.toBeTrpcError("FORBIDDEN");
    await actingAs(owner).trpc.${trpcPath}.delete({ id: row.id });

    await expect(actingAs(owner).trpc.${trpcPath}.byId({ id: row.id })).rejects.toBeTrpcError("NOT_FOUND");
  });
`);
  }

  return {
    createInput: objectLiteral([...samples, ...columns.map((column) => `${column}: "First ${column}"`)]),
    updateInput: objectLiteral(["id: created.id", ...samples, ...columns.map((column) => `${column}: "Second ${column}"`)]),
    referenceImports: [...references.values()]
      .map((reference) => {
        const { factory } = reference;
        const local = referenceFactory(reference);

        if (!factory) return `import { ${reference.table} } from "${importFrom(router, reference.file)}";\n`;

        return `import { ${factory.name === local ? local : `${factory.name} as ${local}`} } from "${importFrom(router, factory.file)}";\n`;
      })
      .join(""),
    referenceFactories: [...references.values()]
      .filter((reference) => !reference.factory)
      .map(
        (reference) =>
          `const ${referenceFactory(reference)} = defineFactory(${reference.table}${reference.owned ? ", {\n  ownerId: async () => (await userFactory()).id,\n}" : ""});\n`,
      )
      .join(""),
    factoryFields: fields
      .filter((field) => !field.unique)
      .map((field) => `  ${field.key}: ${field.reference ? "async () => " : ""}${fieldSample(field)},\n`)
      .join(""),
    extraTests: tests.join(""),
    softDeleteImport: options.softDeletes ? ", expectSoftDeleted" : "",
  };
}

function formFields(fields: Field[], columns: string[], indent: string) {
  return [
    ...fields.map((field) => [field.column, fieldControl(field, `form.state.${field.key}`)]),
    ...columns.map((column) => [column, `<UInput v-model="form.state.${toCamelCase(column)}" class="w-full" />`]),
  ]
    .filter(([, control]) => control)
    .map(([column = "", control]) =>
      [`<UFormField name="${toCamelCase(column)}" label="${toSentenceCase(column)}">`, `  ${control}`, "</UFormField>"]
        .map((line) => `${indent}${line}\n`)
        .join(""),
    )
    .join("");
}

function uiFiles(name: string, paths: AppPaths, options: CrudOptions, values: Record<string, string>): GeneratedFile[] {
  const fields = options.fields ?? [];
  const columns = options.searchable ?? [];
  const shown = [...fields.filter((field) => field.type !== "json").map((field) => field.column), ...columns];
  const title = toSentenceCase(name);
  const uiValues = {
    ...values,
    listTitle: `${title} list`,
    titleLower: title.toLowerCase(),
    tableColumns: ["id", ...shown]
      .map((column) => `{ accessorKey: '${toCamelCase(column)}', header: '${column === "id" ? "ID" : toSentenceCase(column)}' }, `)
      .join(""),
    timestampCells: fields
      .filter((field) => field.type === "timestamp")
      .map(({ key }) => `      <template #${key}-cell="{ row }">\n        <DateTime v-if="row.original.${key}" :value="row.original.${key}" />\n      </template>\n`)
      .join(""),
    searchAttribute: columns.length > 0 ? `\n      search="Search ${title.toLowerCase()}"` : "",
    createDefaults: objectLiteral([
      ...fields.map((field) => `${field.key}: ${fieldDefault(field)}`),
      ...columns.map((column) => `${toCamelCase(column)}: ""`),
    ]),
    referenceQueries: [...new Map(fields.flatMap(({ reference }) => (reference?.list ? [[reference.list.query, reference.list]] : []))).values()]
      .map(({ query, trpcPath }) => `const ${query} = $api.${trpcPath}.list.useQuery({ perPage: 100 });\n`)
      .join(""),
    updateDefaults: objectLiteral(["id: props.row.id", ...shown.map((column) => `${toCamelCase(column)}: props.row.${toCamelCase(column)}`)]),
  };
  const pagesDir = join(paths.pagesDir, name);

  return [
    { path: join(pagesDir, "index.vue"), template: "page-resource-index.vue.txt", values: uiValues },
    {
      path: join(pagesDir, "new.vue"),
      template: "page-resource-new.vue.txt",
      values: { ...uiValues, formFields: formFields(fields, columns, "      ") },
    },
    {
      path: join(paths.componentsDir, `${toPascalCase(name)}Form.vue`),
      template: "component-resource-form.vue.txt",
      values: { ...uiValues, formFields: formFields(fields, columns, "    ") },
    },
  ];
}

export function crudRouterFiles(
  name: string,
  paths: AppPaths,
  options: CrudOptions = {},
  testTemplate = "router-crud-test.ts.txt",
): GeneratedFile[] {
  kebabName(name, "blog-post");

  const tableValues = {
    tableName: name,
    tableCamelName: toCamelCase(name),
    tablePascalName: toPascalCase(name),
  };
  const ownerRule = '(actor, row) => row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin"';

  const { domain } = options;
  const router = routerFile(name, paths, domain);
  const tableSchemaImport = importFrom(router, tableFile(paths, name, domain));
  const actionsDir = domain ? join(paths.serverDir, "domains", domain, "actions") : join(paths.serverDir, "actions", name);
  const actionsImport = importFrom(router, actionsDir);
  const trpcPath = registeredName(name, domain).split(".").map(toCamelCase).join(".");
  const actionValues = { ...tableValues, domain: name, tableSchemaImport };
  const actionOptions = { withTest: false, values: actionValues, domainFolder: domain !== undefined };
  const actionDomain = domain ?? name;
  const fields = options.fields ?? [];
  const parents = [
    ...new Map(fields.flatMap(({ reference }) => (reference?.owned ? [[reference.table, reference]] : []))).values(),
  ];
  const parentImports = parents
    .map((reference) => `import { ${reference.table} } from "${importFrom(router, reference.file)}";\n`)
    .join("");
  const createChecks = parentChecks(fields, false);
  const updateChecks = parentChecks(fields, true);

  const actions = crudActionNames(name);

  const routerFileValues = {
    ...tableValues,
    ...routerValues(name, options, actionsImport, actions),
    tableSchemaImport,
    actionsImport,
    exportName: definitionExport(registeredName(name, domain), "router"),
    createName: actions.create,
    updateName: actions.update,
    createCamelName: definitionExport(actions.create, "action"),
    updateCamelName: definitionExport(actions.update, "action"),
  };
  const userDataFile = join(paths.serverDir, "privacy", `${name}.user-data`);

  return [
    ...schemaFiles(name, paths, options, true),
    {
      path: `${userDataFile}.ts`,
      template: "user-data.ts.txt",
      values: { camelName: toCamelCase(name), schemaImport: importFrom(userDataFile, tableFile(paths, name, domain)) },
    },
    ...policyFiles(
      name,
      paths,
      "policy-crud.ts.txt",
      { deleteRules: `  delete: ${ownerRule},\n${options.softDeletes ? `  restore: ${ownerRule},\n` : ""}` },
      domain,
    ),
    ...actionFiles(actionDomain, actions.create, paths, {
      ...actionOptions,
      template: "action-crud-create.ts.txt",
      values: {
        ...actionValues,
        drizzleImport: parents.length > 0 ? 'import { and, eq } from "drizzle-orm";\n' : "",
        parentImports,
        parentChecks: createChecks && `${createChecks}\n`,
      },
    }),
    ...actionFiles(actionDomain, actions.update, paths, {
      ...actionOptions,
      template: "action-crud-update.ts.txt",
      values: {
        ...actionValues,
        drizzleImports: parents.length > 0 ? "and, eq" : "eq",
        parentImports,
        parentChecks: updateChecks && `\n${updateChecks}`,
      },
    }),
    ...actionFiles(actionDomain, actions.delete, paths, {
      ...actionOptions,
      template: options.softDeletes ? "action-crud-delete.ts.txt" : "action-crud-hard-delete.ts.txt",
    }),
    ...(options.softDeletes
      ? actionFiles(actionDomain, actions.restore, paths, { ...actionOptions, template: "action-crud-restore.ts.txt" })
      : []),
    { path: `${router}.ts`, template: "router-crud.ts.txt", values: routerFileValues },
    {
      path: `${router}.test.ts`,
      template: testTemplate,
      values: {
        ...tableValues,
        ...testValues(name, options, trpcPath, router),
        tableSchemaImport,
        trpcPath,
        authSchemaPath: importFrom(router, schemaFile(paths.appServerDir, "auth")),
      },
    },
    ...(options.ui ? uiFiles(name, paths, options, tableValues) : []),
  ];
}
