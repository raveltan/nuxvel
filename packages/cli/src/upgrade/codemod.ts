export interface ManualStep {
  line: number;
  message: string;
}

export interface Rewrite {
  output: string;
  manual: ManualStep[];
}

export interface Codemod {
  name: string;
  version: string;
  description: string;
  files: string[];
  rewrite(source: string, file: string, cwd: string): Rewrite;
}
