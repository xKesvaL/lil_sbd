import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import { z } from "zod";

// for more information on configuration, visit:
// https://www.content-collections.dev/docs/configuration

const courseResourceSchema = z.object({
  label: z.string(),
  href: z.string(),
  description: z.string().optional(),
});

const courseDownloadSchema = z.object({
  label: z.string(),
  href: z.string(),
  format: z.string().optional(),
  description: z.string().optional(),
});

const courseChapters = defineCollection({
  name: "courseChapters",
  directory: "content/course/chapters",
  include: "*.mdx",
  schema: z.object({
    content: z.string(),
    title: z.string(),
    slug: z.string(),
    chapterOrder: z.number().int().nonnegative(),
    displayNumber: z.string(),
    summary: z.string(),
    published: z.boolean().default(false),
    comingSoon: z.boolean().default(false),
    noindex: z.boolean().default(false),
    goals: z.array(z.string()).default([]),
    resources: z.array(courseResourceSchema).default([]),
  }),
  transform: async (document, context) => {
    const mdx = await compileMDX(context, document);
    return {
      ...document,
      mdx,
    };
  },
});

const courseLessons = defineCollection({
  name: "courseLessons",
  directory: "content/course/lessons",
  include: "**/*.mdx",
  schema: z.object({
    content: z.string(),
    title: z.string(),
    slug: z.string(),
    chapterSlug: z.string(),
    lessonOrder: z.number().positive(),
    displayNumber: z.string(),
    summary: z.string(),
    published: z.boolean().default(false),
    comingSoon: z.boolean().default(false),
    noindex: z.boolean().default(false),
    youtubeId: z.string().optional(),
    duration: z.string().optional(),
    prerequisites: z.array(z.string()).default([]),
    toolsUsed: z.array(z.string()).default([]),
    resources: z.array(courseResourceSchema).default([]),
    downloads: z.array(courseDownloadSchema).default([]),
  }),
  transform: async (document, context) => {
    const mdx = await compileMDX(context, document);
    return {
      ...document,
      mdx,
    };
  },
});

export default defineConfig({
  content: [courseChapters, courseLessons],
});
