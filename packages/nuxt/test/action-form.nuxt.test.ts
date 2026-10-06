import { defineComponent, h, ref } from "vue";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { readBody } from "h3";
import superjson from "superjson";
import { ActionField, ActionForm } from "#components";
import { $api, useAppConfig } from "#imports";

async function mountForm(slots: object, props: object = {}) {
  const wrapper = await mountSuspended(
    defineComponent({
      setup: () => () => h(ActionForm, { action: $api._actionFormCheck.save, defaults: { title: "Hello" }, ...props }, slots),
    }),
  );
  onTestFinished(() => wrapper.unmount());
  return wrapper;
}

async function mountEdge(props: object) {
  const wrapper = await mountSuspended(defineComponent({ setup: () => () => h(ActionForm, { action: $api._actionFormCheck.edge, ...props }) }));
  onTestFinished(() => wrapper.unmount());
  return wrapper;
}

function inputOf(wrapper: Awaited<ReturnType<typeof mountEdge>>, label: string) {
  const id = wrapper.findAll("label").filter((candidate) => candidate.text() === label)[0]?.attributes("for");
  return wrapper.get(`[id="${id}"]`);
}

function edgeEndpoint() {
  const bodies: Record<string, unknown>[] = [];
  registerEndpoint("/api/trpc/_actionFormCheck.edge", {
    method: "POST",
    handler: async (event) => {
      bodies.push(superjson.deserialize(await readBody(event)));
      return { result: { data: { json: "ok" } } };
    },
  });
  return bodies;
}

describe("<ActionForm>", () => {
  it("renders a #field-<name> slot inside the field, with the label and a value bound to the state", async () => {
    const wrapper = await mountForm({
      "field-title": ({ field }: { field: { label: string; value: string } }) =>
        h("input", {
          "data-test": "custom",
          "aria-label": `Custom ${field.label}`,
          value: field.value,
          onInput: (event: Event) => {
            if (event.target instanceof HTMLInputElement) field.value = event.target.value.toUpperCase();
          },
        }),
    });
    const input = wrapper.get<HTMLInputElement>('[data-test="custom"]');

    expect(input.attributes("aria-label")).toBe("Custom Title");
    expect(input.element.value).toBe("Hello");
    await input.setValue("changed");
    expect(input.element.value).toBe("CHANGED");
  });

  it("renders only the ActionFields of its default slot, and the #actions slot with pending", async () => {
    const wrapper = await mountForm({
      default: () => h("div", { class: "layout" }, [h(ActionField, { name: "title" })]),
      actions: ({ pending }: { pending: boolean }) => h("button", { type: "submit" }, pending ? "Saving" : "Go"),
    });

    expect(wrapper.findAll("input").map((input) => input.attributes("type"))).toEqual(["text"]);
    expect(wrapper.find(".layout input").exists()).toBe(true);
    expect(wrapper.get("button").text()).toBe("Go");
  });

  it("merges the ui prop over the app.config.ts ui.actionForm slots", async () => {
    const ui = useAppConfig().ui;
    Reflect.set(ui, "actionForm", { slots: { root: "app-root gap-2", actions: "app-actions" } });
    onTestFinished(() => {
      Reflect.deleteProperty(ui, "actionForm");
    });

    const wrapper = await mountForm({}, { ui: { root: "gap-4" }, class: "prop-class" });

    expect(wrapper.get("form").classes()).toEqual(expect.arrayContaining(["app-root", "gap-4", "prop-class"]));
    expect(wrapper.get("form").classes()).not.toContain("gap-2");
    expect(wrapper.find(".app-actions button").exists()).toBe(true);
  });

  it("warns in development about a field with no default input and no slot", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());

    await mountForm({ "field-tags": () => h("p", "Tags") });
    expect(warn.mock.calls.flat().join("\n")).not.toContain('"tags"');

    await mountForm({});
    expect(warn.mock.calls.flat().join("\n")).toContain('$api._actionFormCheck.save has no default input for the field "tags"');
  });

  it("does not take an inherited object property for an input kind", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());

    const wrapper = await mountEdge({});

    expect(wrapper.findAll("label").map((label) => label.text())).not.toContain("Legacy");
    expect(warn.mock.calls.flat().join("\n")).toContain('no default input for the field "legacy"');
  });

  it("follows changes of the fields and hidden props", async () => {
    const fields = ref({ title: { label: "Headline" } });
    const hidden = ref(["teamId"]);
    const wrapper = await mountSuspended(
      defineComponent({ setup: () => () => h(ActionForm, { action: $api._actionFormCheck.save, fields: fields.value, hidden: hidden.value }) }),
    );
    onTestFinished(() => wrapper.unmount());
    const labels = () => wrapper.findAll("label").map((label) => label.text());

    expect(labels()).toContain("Headline");
    fields.value = { title: { label: "Heading" } };
    hidden.value = ["teamId", "contactEmail"];
    await vi.waitFor(() => expect(labels()).toContain("Heading"));
    expect(labels()).not.toContain("Contact email");
    expect(labels()).not.toContain("Team id");
  });

  it("shows a schema error of a hidden field in the form error", async () => {
    const wrapper = await mountEdge({ hidden: "teamId" });

    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() => expect(wrapper.text()).toMatch(/expected number/));
  });

  it("shows a server error of a hidden field in the form error", async () => {
    registerEndpoint("/api/trpc/_actionFormCheck.edge", {
      method: "POST",
      handler: () => ({
        error: { json: { message: "Team is full", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 400, fields: { teamId: ["Team is full"] } } } },
      }),
    });
    const wrapper = await mountEdge({ hidden: "teamId", defaults: { teamId: 1, subtitle: null, richNullable: null } });

    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() => expect(wrapper.text()).toContain("Team is full"));
  });

  it("sends a cleared nullable field as null and a cleared optional field as undefined", async () => {
    const bodies = edgeEndpoint();
    const wrapper = await mountEdge({ hidden: "teamId", defaults: { teamId: 1, subtitle: "Old", website: "https://old.example", richNullable: null } });

    await inputOf(wrapper, "Subtitle").setValue("");
    await inputOf(wrapper, "Website").setValue("");
    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ subtitle: null, website: undefined });
  });

  it("shows a UTC-midnight Date on its own day, and nothing for an empty value, an invalid Date or a bad string", async () => {
    const dated = await mountForm({}, { defaults: { endsAt: new Date("2026-04-01T00:00:00Z"), startsOn: "nope" } });
    const empty = await mountForm({}, { defaults: { endsAt: new Date("not a date") } });
    const dateOf = (wrapper: typeof dated, label: string) => inputOf(wrapper, label).attributes("value");

    expect(dateOf(dated, "Ends at")).toBe("2026-04-01");
    expect(dateOf(dated, "Starts on")).toBe("");
    expect(dateOf(empty, "Ends at")).toBe("");
    expect(dateOf(empty, "Starts on")).toBe("");
  });

  it("renders richText() inside .optional(), .nullable() and .default() as a textarea", async () => {
    const wrapper = await mountEdge({});

    expect(wrapper.findAll("textarea")).toHaveLength(3);
  });

  it("renders an <UploadField> for a field with .meta({ upload })", async () => {
    const wrapper = await mountForm({});

    expect(wrapper.findComponent({ name: "UploadField" }).props()).toMatchObject({ name: "profile-avatar", field: "avatarKey" });
  });
});
