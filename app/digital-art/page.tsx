import type { Metadata } from "next";
import { importPage } from "nextra/pages";

import { PreviewGrid } from "@/components/preview-grid";
import { getEntriesBySection, getSectionListTitle } from "@/lib/content";
import { renderMdxIntro } from "@/lib/render-mdx-intro";

export async function generateMetadata(): Promise<Metadata> {
  const { metadata } = await importPage(["digital-art"]);

  return metadata;
}

export default async function DigitalArtPage() {
  const [{ default: IntroContent, metadata }, entries] = await Promise.all([
    importPage(["digital-art"]),
    getEntriesBySection("digital-art"),
  ]);

  return (
    <div className="page-stack">
      {renderMdxIntro(metadata, <IntroContent />)}
      <PreviewGrid
        items={entries}
        section="digital-art"
        title={getSectionListTitle("digital-art")}
      />
    </div>
  );
}
