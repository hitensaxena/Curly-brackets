import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TrackPanel } from "@/components/detail-panels";
import { getEntriesBySection, getEntryBySlug } from "@/lib/content";

export async function generateStaticParams() {
  const entries = await getEntriesBySection("music");

  return entries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;

  try {
    const entry = await getEntryBySlug("music", slug);

    return {
      title: entry.metadata.title,
      description: entry.metadata.description,
    };
  } catch {
    return {};
  }
}

export default async function MusicDetailPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  let entry;

  try {
    entry = await getEntryBySlug("music", slug);
  } catch {
    notFound();
  }

  const { MDXContent, metadata } = entry;

  return (
    <article className="page-stack detail-page detail-page--music">
      <header className="detail-header">
        <span className="eyebrow">Music</span>
        <h1 className="detail-title">{metadata.title}</h1>
        <p className="detail-copy">{metadata.description}</p>
        <div className="post-summary__header">
          {metadata.date ? (
            <time className="detail-date" dateTime={metadata.date}>
              {metadata.date}
            </time>
          ) : (
            <span />
          )}
          {metadata.duration ? (
            <span className="detail-date">{metadata.duration}</span>
          ) : null}
        </div>
      </header>
      <TrackPanel metadata={metadata} />
      <section className="detail-body">
        <MDXContent />
      </section>
    </article>
  );
}
