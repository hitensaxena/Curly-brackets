import type { Metadata } from "next";
import { importPage } from "nextra/pages";

import { PreviewGrid } from "@/components/preview-grid";
import { getEntriesBySection, getSectionListTitle } from "@/lib/content";
import { renderMdxIntro } from "@/lib/render-mdx-intro";

export async function generateMetadata(): Promise<Metadata> {
  const { metadata } = await importPage(["web-experiences"]);

  return metadata;
}

export default async function WebExperiencesPage() {
  const [{ default: IntroContent, metadata }, entries] = await Promise.all([
    importPage(["web-experiences"]),
    getEntriesBySection("web-experiences"),
  ]);

  return (
    <div className="page-stack">
      {renderMdxIntro(metadata, <IntroContent />)}
      <PreviewGrid
        items={entries}
        section="web-experiences"
        title={getSectionListTitle("web-experiences")}
      />
    </div>
  );
}
