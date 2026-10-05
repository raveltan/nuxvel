export default defineAppConfig({
  ui: {
    colors: { primary: "crimson", neutral: "stone" },
    button: {
      compoundVariants: [
        {
          color: "primary",
          variant: "solid",
          class: "text-white dark:bg-crimson-600 dark:hover:bg-crimson-600/75 dark:active:bg-crimson-600/75",
        },
      ],
    },
  },
});
