import Link from "next/link";

import type { ContentPreview, SectionDefinition } from "@/lib/content";

import { PreviewCard } from "./preview-card";

export function LandingSection({
  items,
  section,
}: {
  items: ContentPreview[];
  section: SectionDefinition;
}) {
  return (
    <section className={`landing-section landing-section--${section.key}`}>
      <div className="landing-section__header">
        <div className="landing-section__copy">
          <span className="eyebrow">{section.label}</span>
          <h2 className="section-title">{section.heading}</h2>
          <p className="section-copy">{section.description}</p>
        </div>
        <Link className="inline-action" href={section.href}>
          Explore More
        </Link>
      </div>
      <div className={`preview-grid preview-grid--${section.key}`}>
        {items.map((item) => (
          <PreviewCard item={item} key={item.route} />
        ))}
      </div>
    </section>
  );
}
