import { named } from "../../../src/runtime/server/discovery/definition-name";
import flagsChannel from "../../../src/runtime/server/flags/channel/flags-channel";
import maintenanceChannel from "../../../src/runtime/server/maintenance/channel/maintenance-channel";

export default [
  named(flagsChannel, "flags", "flags-channel.ts"),
  named(maintenanceChannel, "maintenance", "maintenance-channel.ts"),
];
