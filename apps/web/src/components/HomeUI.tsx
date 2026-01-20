import type { HOME_QUERY_RESULT } from "@/sanity/types";
import { useQuery, type SanityProps } from "@tinloof/sanity-astro/loader";

/**
 * Component with live updates when in visual editing mode.
 * Uses client:visualEditing directive - only hydrates when visual editing is enabled.
 */
export default function HomeUI({ query, params, initial }: SanityProps<HOME_QUERY_RESULT>) {
  const { data } = useQuery<HOME_QUERY_RESULT>(query, params, { initial });

  return (
    <div>
      <h1>Sanity Data</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
