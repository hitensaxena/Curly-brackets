import type { Metadata } from "next";
import { importPage } from "nextra/pages";

import { PreviewGrid } from "@/components/preview-grid";
import { getEntriesBySection, getSectionListTitle } from "@/lib/content";
import { renderMdxIntro } from "@/lib/render-mdx-intro";

export async function generateMetadata(): Promise<Metadata> {
  const { metadata } = await importPage(["ui-ux-design"]);

  return metadata;
}

export default async function UiUxDesignPage() {
  const [{ default: IntroContent, metadata }, entries] = await Promise.all([
    importPage(["ui-ux-design"]),
    getEntriesBySection("ui-ux-design"),
  ]);

  return (
    <div className="page-stack">
      {renderMdxIntro(metadata, <IntroContent />)}
      <PreviewGrid
        items={entries}
        section="ui-ux-design"
        title={getSectionListTitle("ui-ux-design")}
      />
    </div>
  );
}
