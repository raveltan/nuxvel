import { named } from "../../../packages/nuxt/src/runtime/server/discovery/definition-name";

// a probe defined inline in a route is not discovered, so nothing would name it
export function probeNamed<const Name extends string, Definition>(name: Name, definition: Definition) {
  return named(definition, name, "a playground probe");
}
