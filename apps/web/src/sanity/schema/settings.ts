import { defineField, defineType } from "sanity";

export const settings = defineType({
  name: "settings",
  title: "Site Settings",
  type: "document",
  fields: [
    defineField({
      name: "siteName",
      title: "Site Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "navigation",
      title: "Navigation Links",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "label", title: "Label", type: "string" },
            { name: "href", title: "URL", type: "string" },
          ],
        },
      ],
    }),
    defineField({
      name: "footerText",
      title: "Footer Text",
      type: "string",
    }),
    defineField({
      name: "footerLinks",
      title: "Footer Links",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "label", title: "Label", type: "string" },
            { name: "href", title: "URL", type: "string" },
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: "siteName",
    },
  },
});
