import type { HOME_QUERY_RESULT } from "@/sanity/types";
import { useQuery, type SanityProps } from "@tinloof/sanity-astro/loader";

/**
 * Component with live updates when in visual editing mode.
 * Uses client:visualEditing directive - only hydrates when visual editing is enabled.
 */
export default function HomeUI({ query, params, initial }: SanityProps<HOME_QUERY_RESULT>) {
  const { data } = useQuery<HOME_QUERY_RESULT>(query, params, { initial });

  if (!data) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <article>
      <h1 className="text-4xl font-bold text-gray-900 mb-4">{data.title}</h1>
      {data.description && (
        <p className="text-lg text-gray-600 leading-relaxed">{data.description}</p>
      )}
    </article>
  );
}
