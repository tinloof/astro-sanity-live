// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react()],
  adapter: cloudflare(),
  env: {
    schema: {
      PUBLIC_SANITY_PROJECT_ID: envField.string({ context: "client", access: "public" }),
      PUBLIC_SANITY_DATASET: envField.string({ context: "client", access: "public" }),
    },
  },
});
