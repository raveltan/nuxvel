declare module "mjml-core" {
  export interface MjmlValidationError {
    line: number;
    tagName: string;
    message: string;
  }

  export interface MjmlPreset {
    components: unknown[];
    dependencies: Record<string, unknown>;
  }

  export type Mjml2Html = (
    mjml: string,
    options?: { validationLevel?: "strict" | "soft" | "skip"; presets?: MjmlPreset[] },
  ) => Promise<{ html: string; errors: MjmlValidationError[] }>;

  const mjmlCore: Mjml2Html | { default: Mjml2Html };
  export default mjmlCore;
}

declare module "mjml-preset-core" {
  import type { MjmlPreset } from "mjml-core";

  const presetCore: MjmlPreset;
  export default presetCore;
}
