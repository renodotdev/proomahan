import "server-only";
import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import { requiredEnv } from "./environment.ts";

export function getStorage() {
  for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL_S3", "AWS_REGION"]) requiredEnv(name);
  return new Files({ adapter: neon({ bucket: "assets" }) });
}
