import { visionTool } from "@sanity/vision";
import { presentationTool } from "sanity/presentation";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schema";

export default defineConfig({
  name: "default",
  title: "Brandyour CF",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || "fl1nk1cy",
  dataset: process.env.SANITY_STUDIO_DATASET || "production",
  plugins: [
    structureTool(),
    presentationTool({
      previewUrl: "http://localhost:3000?sanity-visual-editing",
    }),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
});
