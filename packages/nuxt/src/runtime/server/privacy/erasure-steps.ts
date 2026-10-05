type ErasureStep = (userId: string) => Promise<void>;

const steps: ErasureStep[] = [];

export function beforeUserErasure(step: ErasureStep) {
  steps.push(step);
}

export async function runErasureSteps(userId: string) {
  for (const step of steps) await step(userId);
}
