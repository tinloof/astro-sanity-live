import { visionTool } from "@sanity/vision";
import { presentationTool } from "sanity/presentation";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schema";

// Detect environment and set preview URL accordingly
const isProduction = import.meta.env.PROD;
const previewUrl = isProduction
  ? "https://astro-sanity-live.seif.workers.dev"
  : "http://localhost:3000";

export default defineConfig({
  name: "default",
  title: "Brandyour CF",
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID || "fl1nk1cy",
  dataset: import.meta.env.PUBLIC_SANITY_DATASET || "production",
  basePath: "/cms",
  plugins: [
    structureTool(),
    presentationTool({
      previewUrl,
    }),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
});
