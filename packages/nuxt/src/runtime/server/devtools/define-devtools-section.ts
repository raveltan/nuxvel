import { defineNitroPlugin } from "nitropack/runtime";

export interface DevtoolsSection<Data> {
  id: string;
  title: string;
  order: number;
  load: () => Promise<Data>;
}

const sections = new Map<string, DevtoolsSection<unknown>>();

export function devtoolsSections() {
  return [...sections.values()].sort((a, b) => a.order - b.order);
}

export function defineDevtoolsSection<Data>(section: DevtoolsSection<Data>) {
  return defineNitroPlugin(() => {
    sections.set(section.id, section);
  });
}
