export const probeCtaExperiment = defineExperiment({
  variants: { control: 50, green: 50 },
  metrics: ["probe.converted"],
});
