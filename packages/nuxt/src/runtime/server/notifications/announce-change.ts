import { notificationChannelName } from "../../shared/realtime/notification-channel";
import { publishChannelMessage } from "../realtime/streams/publish-message";

export async function announceChange(userIds: readonly string[]) {
  await Promise.all(userIds.map((userId) => publishChannelMessage(notificationChannelName(userId), "changed", {})));
}
