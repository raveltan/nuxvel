import { namedExportJob } from "#server/jobs/_probe/named-export.job";
import recordJob from "#server/jobs/_probe/record";
import { postNotifyFollowersJob } from "#server/jobs/post/notify-followers.job";

export default defineEventHandler(() => ({
  record: recordJob.name,
  namedExport: namedExportJob.name,
  nested: postNotifyFollowersJob.name,
}));
