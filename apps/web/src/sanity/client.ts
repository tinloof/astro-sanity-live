import { createClient, type QueryParams } from "@sanity/client";

export const client = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID || "fl1nk1cy",
  dataset: import.meta.env.PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  useCdn: true,
});

export async function loadQuery<T>(query: string, params?: QueryParams): Promise<T> {
  if (params) {
    return client.fetch<T>(query, params);
  }
  return client.fetch<T>(query);
}
