import { defineNitroPlugin } from "nitropack/runtime";
import { beforeUserErasure } from "../../privacy/erasure-steps";
import { cancelSubscriptionsOf } from "../cancel-on-erasure";

export default defineNitroPlugin(() => {
  beforeUserErasure(cancelSubscriptionsOf);
});
