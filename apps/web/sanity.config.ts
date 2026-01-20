import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schema";

export default defineConfig({
  name: "default",
  title: "Brandyour CF",
  projectId: import.meta.env.SANITY_STUDIO_PROJECT_ID || "fl1nk1cy",
  dataset: import.meta.env.SANITY_STUDIO_DATASET || "production",
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
});
