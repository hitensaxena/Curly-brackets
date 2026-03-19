import { readdir } from "node:fs/promises";
import path from "node:path";

import { importPage } from "nextra/pages";

export type SectionKey =
  | "journal"
  | "ui-ux-design"
  | "digital-art"
  | "music"
  | "web-experiences";

export type GalleryItem = {
  src: string;
  alt: string;
  caption?: string;
};

export type ContentMetadata = {
  title?: string;
  description?: string;
  date?: string;
  tags?: string[];
  thumbnail?: string;
  draft?: boolean;
  summary?: string;
  role?: string;
  timeline?: string;
  tools?: string[];
  gallery?: GalleryItem[];
  audioSrc?: string;
  duration?: string;
  href?: string;
  embedUrl?: string;
};

export type SectionDefinition = {
  key: SectionKey;
  label: string;
  href: string;
  heading: string;
  description: string;
  cardTheme: string;
};

export type ContentPreview = {
  section: SectionKey;
  route: string;
  slug: string;
  title: string;
  description: string;
  date?: string;
  tags?: string[];
  thumbnail?: string;
  kindLabel: string;
  meta?: string;
  kicker?: string;
};

type CategoryConfig = SectionDefinition & {
  indexTitle: string;
  previewKind: string;
  previewMeta: (metadata: ContentMetadata) => string | undefined;
  previewKicker?: (metadata: ContentMetadata) => string | undefined;
};

const CONTENT_DIRECTORY = path.join(process.cwd(), "content");

const categoryRegistry: Record<SectionKey, CategoryConfig> = {
  journal: {
    key: "journal",
    label: "Journal",
    href: "/journal",
    heading: "Essays and notes from the working week.",
    description:
      "Observations, rough thinking, and process notes that sit behind the rest of the work.",
    cardTheme: "editorial",
    indexTitle: "Latest Journal Entries",
    previewKind: "Journal Post",
    previewMeta: (metadata) => metadata.date,
    previewKicker: (metadata) => metadata.tags?.[0],
  },
  "ui-ux-design": {
    key: "ui-ux-design",
    label: "UI/UX Design",
    href: "/ui-ux-design",
    heading: "Product and interaction work as compact case studies.",
    description:
      "Projects framed with the context, decisions, and outcomes needed to understand the work quickly.",
    cardTheme: "case-study",
    indexTitle: "Case Studies",
    previewKind: "Case Study",
    previewMeta: (metadata) =>
      [metadata.role, metadata.timeline].filter(Boolean).join(" / ") || metadata.date,
    previewKicker: (metadata) => metadata.summary,
  },
  "digital-art": {
    key: "digital-art",
    label: "Digital Art",
    href: "/digital-art",
    heading: "Visual studies arranged as compact gallery entries.",
    description:
      "Color, shape, and composition lead here, with only enough text to orient the work.",
    cardTheme: "gallery",
    indexTitle: "Gallery Entries",
    previewKind: "Gallery Entry",
    previewMeta: (metadata) => {
      const count = metadata.gallery?.length ?? 0;
      return count ? `${count} image${count === 1 ? "" : "s"}` : metadata.date;
    },
    previewKicker: () => "Gallery",
  },
  music: {
    key: "music",
    label: "Music",
    href: "/music",
    heading: "Tracks, loops, and sketches made for listening first.",
    description:
      "Finished pieces, rough loops, and sonic studies presented with minimal framing.",
    cardTheme: "track",
    indexTitle: "Tracks",
    previewKind: "Track",
    previewMeta: (metadata) =>
      [metadata.duration, metadata.date].filter(Boolean).join(" / "),
    previewKicker: () => "Audio",
  },
  "web-experiences": {
    key: "web-experiences",
    label: "Web Experiences",
    href: "/web-experiences",
    heading: "Interactive browser work with a direct path into the experience.",
    description:
      "Browser-native experiments and interfaces that make the most sense once they are opened and used.",
    cardTheme: "interactive",
    indexTitle: "Interactive Work",
    previewKind: "Web Experience",
    previewMeta: (metadata) =>
      metadata.embedUrl ? "Embedded preview available" : metadata.href ? "External launch" : metadata.date,
    previewKicker: () => "Interactive",
  },
};

export const sections: SectionDefinition[] = (
  Object.values(categoryRegistry) as CategoryConfig[]
).map((section) => ({
  key: section.key,
  label: section.label,
  href: section.href,
  heading: section.heading,
  description: section.description,
  cardTheme: section.cardTheme,
}));

export const sectionConfig = Object.fromEntries(
  sections.map((section) => [section.key, section]),
) as Record<SectionKey, SectionDefinition>;

function compareByDateDescending(a?: string, b?: string) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  return new Date(b).getTime() - new Date(a).getTime();
}

function filterStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function filterGallery(value: unknown): GalleryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const raw = item as Record<string, unknown>;

    if (typeof raw.src !== "string" || typeof raw.alt !== "string") {
      return [];
    }

    return [
      {
        src: raw.src,
        alt: raw.alt,
        caption: typeof raw.caption === "string" ? raw.caption : undefined,
      },
    ];
  });
}

function normalizeMetadata(metadata: unknown): ContentMetadata {
  const frontMatter = (metadata ?? {}) as Record<string, unknown>;

  return {
    title: typeof frontMatter.title === "string" ? frontMatter.title : undefined,
    description:
      typeof frontMatter.description === "string"
        ? frontMatter.description
        : undefined,
    date: typeof frontMatter.date === "string" ? frontMatter.date : undefined,
    tags: filterStringArray(frontMatter.tags),
    thumbnail:
      typeof frontMatter.thumbnail === "string"
        ? frontMatter.thumbnail
        : undefined,
    draft: typeof frontMatter.draft === "boolean" ? frontMatter.draft : undefined,
    summary:
      typeof frontMatter.summary === "string" ? frontMatter.summary : undefined,
    role: typeof frontMatter.role === "string" ? frontMatter.role : undefined,
    timeline:
      typeof frontMatter.timeline === "string" ? frontMatter.timeline : undefined,
    tools: filterStringArray(frontMatter.tools),
    gallery: filterGallery(frontMatter.gallery),
    audioSrc:
      typeof frontMatter.audioSrc === "string" ? frontMatter.audioSrc : undefined,
    duration:
      typeof frontMatter.duration === "string" ? frontMatter.duration : undefined,
    href: typeof frontMatter.href === "string" ? frontMatter.href : undefined,
    embedUrl:
      typeof frontMatter.embedUrl === "string" ? frontMatter.embedUrl : undefined,
  };
}

async function collectMdxSlugs(section: SectionKey) {
  const directory = path.join(CONTENT_DIRECTORY, section);
  const entries = await readdir(directory, { withFileTypes: true });

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== "index.mdx" &&
        /\.(md|mdx)$/.test(entry.name),
    )
    .map((entry) => entry.name.replace(/\.(md|mdx)$/, ""));
}

async function getSectionEntries(section: SectionKey): Promise<ContentPreview[]> {
  const config = categoryRegistry[section];
  const slugs = await collectMdxSlugs(section);

  const entries: Array<ContentPreview | null> = await Promise.all(
    slugs.map(async (slug) => {
      const { metadata } = await importPage([section, slug]);
      const frontMatter = normalizeMetadata(metadata);

      if (frontMatter.draft) {
        return null;
      }

      return {
        section,
        route: `/${section}/${slug}`,
        slug,
        title: frontMatter.title ?? slug,
        description: frontMatter.description ?? "",
        date: frontMatter.date,
        tags: frontMatter.tags,
        thumbnail:
          frontMatter.thumbnail ?? frontMatter.gallery?.[0]?.src ?? undefined,
        kindLabel: config.previewKind,
        meta: config.previewMeta(frontMatter),
        kicker: config.previewKicker?.(frontMatter),
      } satisfies ContentPreview;
    }),
  );

  return entries
    .filter((entry): entry is ContentPreview => Boolean(entry))
    .sort((left, right) => compareByDateDescending(left.date, right.date));
}

export async function getEntriesBySection(section: SectionKey) {
  return getSectionEntries(section);
}

export async function getEntryBySlug(section: SectionKey, slug: string) {
  const { default: MDXContent, metadata } = await importPage([section, slug]);

  return {
    MDXContent,
    metadata: normalizeMetadata(metadata),
  };
}

export async function getHomepageCollections() {
  const collections = await Promise.all(
    (Object.keys(categoryRegistry) as SectionKey[]).map(async (section) => ({
      section,
      items: (await getSectionEntries(section)).slice(0, 3),
    })),
  );

  return collections;
}

export function getSectionListTitle(section: SectionKey) {
  return categoryRegistry[section].indexTitle;
}

export function getSectionCardTheme(section: SectionKey) {
  return categoryRegistry[section].cardTheme;
}
