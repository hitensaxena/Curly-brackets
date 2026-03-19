import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GalleryPanel } from "@/components/detail-panels";
import { getEntriesBySection, getEntryBySlug } from "@/lib/content";

export async function generateStaticParams() {
  const entries = await getEntriesBySection("digital-art");

  return entries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;

  try {
    const entry = await getEntryBySlug("digital-art", slug);

    return {
      title: entry.metadata.title,
      description: entry.metadata.description,
    };
  } catch {
    return {};
  }
}

export default async function DigitalArtDetailPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  let entry;

  try {
    entry = await getEntryBySlug("digital-art", slug);
  } catch {
    notFound();
  }

  const { MDXContent, metadata } = entry;

  return (
    <article className="page-stack detail-page detail-page--digital-art">
      <header className="detail-header">
        <span className="eyebrow">Digital Art</span>
        <h1 className="detail-title">{metadata.title}</h1>
        <p className="detail-copy">{metadata.description}</p>
        {metadata.date ? (
          <time className="detail-date" dateTime={metadata.date}>
            {metadata.date}
          </time>
        ) : null}
      </header>
      <GalleryPanel gallery={metadata.gallery ?? []} title={metadata.title ?? "Gallery"} />
      <section className="detail-body">
        <MDXContent />
      </section>
    </article>
  );
}
