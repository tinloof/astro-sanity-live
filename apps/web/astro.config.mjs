// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import sanity from "@tinloof/sanity-astro";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  output: "server",

  integrations: [
    react(),
    sanity({
      projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID || "fl1nk1cy",
      dataset: import.meta.env.PUBLIC_SANITY_DATASET || "production",
      studioBasePath: "/cms",
    }),
  ],

  adapter: cloudflare(),

  env: {
    schema: {
      PUBLIC_SANITY_PROJECT_ID: envField.string({ context: "client", access: "public" }),
      PUBLIC_SANITY_DATASET: envField.string({ context: "client", access: "public" }),
      SANITY_API_READ_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});