import { visionTool } from "@sanity/vision";
import { presentationTool } from "sanity/presentation";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schema";

// Detect environment and set preview URL accordingly
// In production builds, use the production URL
const isProduction = process.env.NODE_ENV === "production";
const previewUrl = isProduction
  ? "https://astro-sanity-live.seif.workers.dev"
  : "http://localhost:3000";

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
