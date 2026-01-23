import groq from "groq";

export const HOME_QUERY = groq`*[_type == "home"][0]{
  title,
  description
}`;

export const PAGE_QUERY = groq`*[_type == "page" && slug.current == $slug][0]{
  title,
  "slug": slug.current,
  content
}`;

export const SETTINGS_QUERY = groq`*[_type == "settings"][0]{
  siteName,
  navigation[]{
    label,
    href
  },
  footerText,
  footerLinks[]{
    label,
    href
  }
}`;
