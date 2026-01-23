import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env["SANITY_STUDIO_PROJECT_ID"] || "fl1nk1cy",
    dataset: process.env["SANITY_STUDIO_DATASET"] || "production",
  },
  project: {
    basePath: "/cms",
  },
  typegen: {
    generates: "./sanity.types.ts",
    overloadClientMethods: true,
  },
});
