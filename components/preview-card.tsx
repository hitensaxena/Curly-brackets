import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import type { ContentPreview } from "@/lib/content";

function CardTags({ tags, limit }: { tags?: string[]; limit?: number }) {
  if (!tags?.length) return null;
  const displayTags = limit ? tags.slice(0, limit) : tags;
  return (
    <ul className="post-summary__tags" aria-label="Tags">
      {displayTags.map((tag) => (
        <li className="post-summary__tag" key={tag}>
          {tag}
        </li>
      ))}
    </ul>
  );
}

function Topline({ kindLabel, date, meta }: { kindLabel: string; date?: string; meta?: string; }) {
  const elements = [
    <span key="kind" className="preview-card__kind" style={{ fontWeight: 700, letterSpacing: "0.1em" }}>{kindLabel}</span>,
    meta && <span key="meta" className="preview-card__meta">{meta}</span>,
    date && <time key="date" dateTime={date} style={{ opacity: 0.6 }}>{date}</time>,
  ].filter(Boolean);

  if (elements.length === 0) return null;

  return (
    <div className="preview-card__topline" style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
      {elements.map((el, idx) => (
        <Fragment key={idx}>
          {el}
          {idx < elements.length - 1 && (
            <span className="preview-card__separator" aria-hidden="true" style={{ margin: "0 0.35rem", opacity: 0.3 }}>&bull;</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

// 1. JOURNAL CARD: Pure Typography, Elegance, No Image.
function JournalCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--journal group" style={{ padding: "1.8rem", background: "linear-gradient(180deg, #fff, #faf9f6)" }}>
      <Topline kindLabel="Essay" date={item.date} />
      <div className="preview-card__body preview-card__body--journal" style={{ marginTop: "1.2rem", flexGrow: 1 }}>
        <h3 className="preview-card__title" style={{ fontSize: "1.65rem", fontFamily: "Georgia, serif", lineHeight: 1.25, color: "var(--ink)" }}>
          <Link href={item.route}>{item.title}</Link>
        </h3>
        {item.kicker ? <p className="preview-card__summary" style={{ fontStyle: "italic", opacity: 0.8, marginTop: "0.6rem" }}>{item.kicker}</p> : null}
        <p className="preview-card__description" style={{ marginTop: "1rem", fontSize: "0.95rem", lineHeight: 1.6, color: "var(--ink-soft)" }}>{item.description}</p>
      </div>
      <div style={{ marginTop: "1.8rem", paddingTop: "1.2rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <CardTags tags={item.tags} />
      </div>
    </article>
  );
}

// 2. DESIGN CARD: Analytical, Metadata-Rich, Technical.
function DesignCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--ui-ux-design group" style={{ padding: "0.95rem", background: "#fff" }}>
      {item.thumbnail ? (
        <Link aria-label={item.title} className="preview-card__media preview-card__media--design" href={item.route}>
          <Image
            alt={item.title}
            className="preview-card__image"
            style={{ objectFit: "cover" }}
            fill
            src={item.thumbnail}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </Link>
      ) : null}
      <div className="preview-card__body" style={{ marginTop: "1rem", flexGrow: 1 }}>
        <Topline kindLabel="Case Study" date={item.date} />
        <h3 className="preview-card__title" style={{ marginTop: "0.6rem", fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description" style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "var(--ink-soft)" }}>{item.description}</p>
      </div>
      
      {/* Spec Grid for Design Details */}
      <div className="preview-card__meta-panel" style={{ marginTop: "1.2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", padding: "0.8rem 1rem", background: "rgba(0,0,0,0.02)", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.04)" }}>
        <div>
           <span style={{ display: "block", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}>Scope / Role</span>
           <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)", display: "block", marginTop: "0.2rem" }}>{item.meta || "Product Designer"}</span>
        </div>
        <div>
           <span style={{ display: "block", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}>Methodology</span>
           <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
              {item.tags?.slice(0,2).map(t => <span key={t} style={{ fontSize: "0.7rem", border: "1px solid rgba(0,0,0,0.1)", background: "#fff", padding: "0.1rem 0.35rem", borderRadius: "4px" }}>{t}</span>)}
           </div>
        </div>
      </div>
    </article>
  );
}

// 3. GALLERY CARD: Art-First, Minimalist Placard.
function GalleryCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--digital-art group" style={{ padding: "0.7rem", background: "#fcfcfc" }}>
      {item.thumbnail ? (
        <Link
          aria-label={item.title}
          className="preview-card__media preview-card__media--gallery"
          href={item.route}
          style={{ borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}
        >
          <Image
            alt={item.title}
            className="preview-card__image"
            style={{ objectFit: "cover" }}
            fill
            src={item.thumbnail}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </Link>
      ) : null}
      <div className="preview-card__body" style={{ padding: "1rem 0.5rem 0.4rem", textAlign: "center", flexGrow: 1 }}>
        <h3 className="preview-card__title" style={{ fontSize: "1.15rem", fontWeight: 600 }}>
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description" style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: "0.4rem", fontStyle: "italic" }}>
          {item.meta || "Digital Piece"} &bull; {item.date || "2026"}
        </p>
      </div>
    </article>
  );
}

// 4. MUSIC CARD: Interactive Audio Vibe.
function MusicCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--music group" style={{ padding: "0.95rem", background: "linear-gradient(to bottom right, #ffffff, #f0f4ff)" }}>
      <div className="preview-card__music-shell" style={{ position: "relative" }}>
        {item.thumbnail ? (
          <Link aria-label={item.title} className="preview-card__media preview-card__media--music" href={item.route}>
            <Image
              alt={item.title}
              className="preview-card__image"
              style={{ objectFit: "cover" }}
              fill
              src={item.thumbnail}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </Link>
        ) : null}
        <div className="preview-card__audio-badge" style={{ position: "absolute", bottom: "0.8rem", left: "0.8rem", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)", padding: "0.4rem 0.8rem", borderRadius: "999px", display: "flex", alignItems: "center", gap: "0.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          <span className="preview-card__sound-bars" aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: "0.15rem", height: "12px" }}>
            <span style={{ width: "3px", height: "60%", background: "#4f46e5", borderRadius: "2px" }} />
            <span style={{ width: "3px", height: "100%", background: "#4f46e5", borderRadius: "2px" }} />
            <span style={{ width: "3px", height: "75%", background: "#4f46e5", borderRadius: "2px" }} />
          </span>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em", color: "#1e1e1e", textTransform: "uppercase" }}>{item.kicker ?? "Audio"}</span>
        </div>
      </div>
      <div className="preview-card__body" style={{ marginTop: "1rem", flexGrow: 1 }}>
        <h3 className="preview-card__title" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description" style={{ marginTop: "0.4rem", fontSize: "0.9rem", color: "var(--ink-soft)" }}>{item.description}</p>
      </div>
      <div className="preview-card__track-row" style={{ marginTop: "auto", paddingTop: "1rem" }}>
        <div className="preview-card__track-meta" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {item.meta ? <p style={{ margin: 0, fontWeight: 600, fontSize: "0.85rem" }}>{item.meta}</p> : null}
          {item.tags?.[0] ? <span style={{ fontSize: "0.7rem", border: "1px solid var(--line)", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "#fff" }}>{item.tags[0]}</span> : null}
        </div>
      </div>
    </article>
  );
}

// 5. EXPERIENCE CARD: Software Component Vibe.
function ExperienceCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--web-experiences group" style={{ padding: "0.95rem", background: "#f8faf9" }}>
      {item.thumbnail ? (
        <Link
          aria-label={item.title}
          className="preview-card__media preview-card__media--experience"
          href={item.route}
        >
          <Image
            alt={item.title}
            className="preview-card__image"
            style={{ objectFit: "cover" }}
            fill
            src={item.thumbnail}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </Link>
      ) : null}
      <div className="preview-card__body" style={{ marginTop: "1rem", flexGrow: 1 }}>
        <Topline kindLabel="Web Experience" date={item.date} />
        <h3 className="preview-card__title" style={{ marginTop: "0.6rem", fontSize: "1.3rem", fontWeight: 700 }}>
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description" style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "var(--ink-soft)" }}>{item.description}</p>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
        <span style={{ fontSize: "0.7rem", backgroundColor: "rgba(0,0,0,0.04)", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>{item.meta ?? "Interactive"}</span>
        <span style={{ fontSize: "0.7rem", backgroundColor: "rgba(0,0,0,0.04)", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>Prototype</span>
      </div>
      <div className="preview-card__cta-row" style={{ marginTop: "1.2rem", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "1rem" }}>
        <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em", color: "var(--ink-soft)" }}>Launch Environment</span>
        <Link href={item.route} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 1rem", background: "#111", color: "#fff", borderRadius: "999px", fontSize: "0.85rem", fontWeight: 600, textDecoration: "none" }}>
          Explore <span aria-hidden="true" style={{ fontSize: "1.1rem", lineHeight: 1 }}>&rarr;</span>
        </Link>
      </div>
    </article>
  );
}

export function PreviewCard({ item }: { item: ContentPreview }) {
  switch (item.section) {
    case "journal":
      return <JournalCard item={item} />;
    case "ui-ux-design":
      return <DesignCard item={item} />;
    case "digital-art":
      return <GalleryCard item={item} />;
    case "music":
      return <MusicCard item={item} />;
    case "web-experiences":
      return <ExperienceCard item={item} />;
    default:
      return null;
  }
}
