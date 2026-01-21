import { defineQuery } from "groq";

export const HOME_QUERY = defineQuery(`*[_type == "home"][0]`);

export const PAGE_QUERY = defineQuery(`*[_type == "page" && slug.current == $slug][0]{
  _id,
  _type,
  title,
  slug,
  content
}`);

export const ALL_PAGES_QUERY = defineQuery(`*[_type == "page" && defined(slug.current)]{
  "slug": slug.current
}`);

export const SETTINGS_QUERY = defineQuery(`*[_type == "settings"][0]{
  siteName,
  navigation,
  footerText,
  footerLinks
}`);
