import type { ContentPreview, SectionKey } from "@/lib/content";
import { getSectionCardTheme } from "@/lib/content";

import { PreviewCard } from "./preview-card";

export function PreviewGrid({
  items,
  section,
  title,
}: {
  items: ContentPreview[];
  section: SectionKey;
  title: string;
}) {
  return (
    <section
      aria-labelledby={`${section}-title`}
      className={`landing-section landing-section--${getSectionCardTheme(section)}`}
    >
      <div className="landing-section__header">
        <h2 className="section-title" id={`${section}-title`}>
          {title}
        </h2>
      </div>
      <div className={`preview-grid preview-grid--${section}`}>
        {items.map((item) => (
          <PreviewCard item={item} key={item.route} />
        ))}
      </div>
    </section>
  );
}
