import type { RecordedEffects } from "../runtime/server/testing/recorders";
import { readControlChannel } from "./control-channel";

export function recordedEffects() {
  return readControlChannel<RecordedEffects>("recorded");
}
