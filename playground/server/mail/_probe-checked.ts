import { h } from "vue";
import { z } from "zod";
import Welcome from "./templates/Welcome.vue";

export default defineMail({
  input: z.object({
    to: z.email(),
    name: z.string().refine(async (name) => name !== "taken", { message: "That name is taken" }),
  }),
  subject: ({ name }) => `Checked, ${name}`,
  render: (props) => h(Welcome, props),
});
