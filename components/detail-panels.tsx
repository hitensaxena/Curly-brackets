import Image from "next/image";
import Link from "next/link";

import type { ContentMetadata, GalleryItem } from "@/lib/content";

export function CaseStudyMetaPanel({ metadata }: { metadata: ContentMetadata }) {
  const items = [
    { label: "Role", value: metadata.role },
    { label: "Timeline", value: metadata.timeline },
    {
      label: "Tools",
      value: metadata.tools?.length ? metadata.tools.join(", ") : undefined,
    },
  ].filter((item) => item.value);

  if (!items.length) {
    return null;
  }

  return (
    <section className="meta-panel" aria-label="Case study details">
      {items.map((item) => (
        <div className="meta-panel__item" key={item.label}>
          <span className="meta-panel__label">{item.label}</span>
          <p className="meta-panel__value">{item.value}</p>
        </div>
      ))}
    </section>
  );
}

export function GalleryPanel({
  gallery,
  title,
}: {
  gallery: GalleryItem[];
  title: string;
}) {
  return (
    <section className="gallery-grid" aria-label={title}>
      {gallery.map((image) => (
        <figure className="gallery-card" key={image.src}>
          <Image
            alt={image.alt}
            className="gallery-image"
            height={900}
            src={image.src}
            width={1200}
          />
          {image.caption ? (
            <figcaption className="gallery-caption">{image.caption}</figcaption>
          ) : null}
        </figure>
      ))}
    </section>
  );
}

export function TrackPanel({ metadata }: { metadata: ContentMetadata }) {
  if (!metadata.audioSrc) {
    return null;
  }

  return (
    <section className="audio-panel">
      <div className="audio-panel__meta">
        <span className="eyebrow">Track Player</span>
        {metadata.duration ? <p className="audio-panel__duration">{metadata.duration}</p> : null}
      </div>
      <audio controls preload="none" src={metadata.audioSrc}>
        Your browser does not support the audio element.
      </audio>
    </section>
  );
}

export function ExperiencePanel({ metadata }: { metadata: ContentMetadata }) {
  return (
    <section className="experience-panel">
      {metadata.embedUrl ? (
        <div className="embed-panel">
          <iframe
            className="experience-frame"
            src={metadata.embedUrl}
            title={metadata.title ?? "Web experience"}
          />
        </div>
      ) : null}
      {metadata.href ? (
        <Link className="inline-action" href={metadata.href} target="_blank">
          Open Experience
        </Link>
      ) : null}
    </section>
  );
}
