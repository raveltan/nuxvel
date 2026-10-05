import type { DeployEnvironment } from "../deploy/define-deploy.ts";

type Offsite = NonNullable<NonNullable<DeployEnvironment["backups"]>["offsite"]>;

export function offsiteEnv(offsite: Offsite) {
  const lines = {
    RCLONE_CONFIG_OFFSITE_TYPE: "s3",
    RCLONE_CONFIG_OFFSITE_PROVIDER: "Other",
    RCLONE_CONFIG_OFFSITE_ENDPOINT: offsite.endpoint,
    RCLONE_CONFIG_OFFSITE_REGION: offsite.region ?? "",
    RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID: offsite.accessKeyId,
    RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY: offsite.secretAccessKey,
    RCLONE_CONFIG_OFFSITE_FORCE_PATH_STYLE: "true",
    NUXVEL_OFFSITE_BUCKET: offsite.bucket,
  };

  return Object.entries(lines).map(([name, value]) => `${name}='${value}'`).join("\n");
}
