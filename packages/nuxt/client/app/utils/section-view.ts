import type { Component } from "vue";

const views = import.meta.glob<Component>("../sections/*.vue", { import: "default", eager: true });

export function sectionView(id: string): Component | undefined {
  return views[`../sections/${id}.vue`];
}
