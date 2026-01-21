import type { PAGE_QUERY_RESULT } from "@/sanity/types";
import { useQuery, type SanityProps } from "@tinloof/sanity-astro/loader";
import { PortableText } from "@portabletext/react";

/**
 * Page component with live updates when in visual editing mode.
 * Uses client:visualEditing directive - only hydrates when visual editing is enabled.
 */
export default function PageUI({ query, params, initial }: SanityProps<PAGE_QUERY_RESULT>) {
  const { data } = useQuery<PAGE_QUERY_RESULT>(query, params, { initial });

  if (!data) {
    return <div className="text-gray-500">Page not found</div>;
  }

  return (
    <article>
      <h1 className="text-4xl font-bold text-gray-900 mb-6">{data.title}</h1>
      {data.content && (
        <div className="prose prose-lg prose-gray">
          <PortableText value={data.content} />
        </div>
      )}
    </article>
  );
}
