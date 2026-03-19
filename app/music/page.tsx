import type { Metadata } from "next";
import { importPage } from "nextra/pages";

import { PreviewGrid } from "@/components/preview-grid";
import { getEntriesBySection, getSectionListTitle } from "@/lib/content";
import { renderMdxIntro } from "@/lib/render-mdx-intro";

export async function generateMetadata(): Promise<Metadata> {
  const { metadata } = await importPage(["music"]);

  return metadata;
}

export default async function MusicPage() {
  const [{ default: IntroContent, metadata }, entries] = await Promise.all([
    importPage(["music"]),
    getEntriesBySection("music"),
  ]);

  return (
    <div className="page-stack">
      {renderMdxIntro(metadata, <IntroContent />)}
      <PreviewGrid
        items={entries}
        section="music"
        title={getSectionListTitle("music")}
      />
    </div>
  );
}
