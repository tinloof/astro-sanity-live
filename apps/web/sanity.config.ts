import { visionTool } from "@sanity/vision";
import { presentationTool } from "sanity/presentation";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schema";

// Preview URL - use production URL when deployed, localhost for dev
const previewUrl = process.env.SANITY_STUDIO_PREVIEW_URL || "http://localhost:3000";

export default defineConfig({
  name: "default",
  title: "Brandyour CF",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || "fl1nk1cy",
  dataset: process.env.SANITY_STUDIO_DATASET || "production",
  plugins: [
    structureTool(),
    presentationTool({
      // The ?sanity-visual-editing param triggers visual editing mode via cookie
      previewUrl: `${previewUrl}?sanity-visual-editing`,
    }),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
});
