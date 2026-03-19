import type { Metadata } from "next";
import { importPage } from "nextra/pages";

import { PreviewGrid } from "@/components/preview-grid";
import { getEntriesBySection, getSectionListTitle } from "@/lib/content";
import { renderMdxIntro } from "@/lib/render-mdx-intro";

export async function generateMetadata(): Promise<Metadata> {
  const { metadata } = await importPage(["journal"]);

  return metadata;
}

export default async function JournalPage() {
  const [{ default: IntroContent, metadata }, entries] = await Promise.all([
    importPage(["journal"]),
    getEntriesBySection("journal"),
  ]);

  return (
    <div className="page-stack">
      {renderMdxIntro(metadata, <IntroContent />)}
      <PreviewGrid
        items={entries}
        section="journal"
        title={getSectionListTitle("journal")}
      />
    </div>
  );
}
