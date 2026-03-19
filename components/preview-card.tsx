import Image from "next/image";
import Link from "next/link";

import type { ContentPreview } from "@/lib/content";

function JournalCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--journal">
      {item.thumbnail ? (
        <Link aria-label={item.title} className="preview-card__media preview-card__media--journal" href={item.route}>
          <Image
            alt={item.title}
            className="preview-card__image"
            height={880}
            src={item.thumbnail}
            width={1320}
          />
        </Link>
      ) : null}
      <div className="preview-card__topline">
        <span className="preview-card__kind">{item.kindLabel}</span>
        {item.date ? <time dateTime={item.date}>{item.date}</time> : null}
      </div>
      <div className="preview-card__body preview-card__body--journal">
        <h3 className="preview-card__title">
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description">{item.description}</p>
      </div>
      {item.tags?.length ? (
        <ul className="post-summary__tags" aria-label="Tags">
          {item.tags.map((tag) => (
            <li className="post-summary__tag" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function DesignCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--ui-ux-design">
      {item.thumbnail ? (
        <Link aria-label={item.title} className="preview-card__media preview-card__media--design" href={item.route}>
          <Image
            alt={item.title}
            className="preview-card__image"
            height={920}
            src={item.thumbnail}
            width={1320}
          />
        </Link>
      ) : null}
      <div className="preview-card__topline">
        <span className="preview-card__kind">{item.kindLabel}</span>
        {item.date ? <time dateTime={item.date}>{item.date}</time> : null}
      </div>
      <div className="preview-card__body">
        <h3 className="preview-card__title">
          <Link href={item.route}>{item.title}</Link>
        </h3>
        {item.kicker ? <p className="preview-card__summary">{item.kicker}</p> : null}
        <p className="preview-card__description">{item.description}</p>
      </div>
      <div className="preview-card__meta-panel">
        {item.meta ? <p className="preview-card__meta">{item.meta}</p> : null}
        {item.tags?.length ? (
          <ul className="post-summary__tags" aria-label="Tags">
            {item.tags.slice(0, 2).map((tag) => (
              <li className="post-summary__tag" key={tag}>
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

function GalleryCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--digital-art">
      {item.thumbnail ? (
        <Link
          aria-label={item.title}
          className="preview-card__media preview-card__media--gallery"
          href={item.route}
        >
          <Image
            alt={item.title}
            className="preview-card__image"
            height={900}
            src={item.thumbnail}
            width={900}
          />
        </Link>
      ) : null}
      <div className="preview-card__body">
        <div className="preview-card__topline">
          <span className="preview-card__kind">{item.kindLabel}</span>
          {item.meta ? <span className="preview-card__meta">{item.meta}</span> : null}
        </div>
        <h3 className="preview-card__title">
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description">{item.description}</p>
      </div>
    </article>
  );
}

function MusicCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--music">
      <div className="preview-card__music-shell">
        {item.thumbnail ? (
          <Link aria-label={item.title} className="preview-card__media preview-card__media--music" href={item.route}>
            <Image
              alt={item.title}
              className="preview-card__image"
              height={900}
              src={item.thumbnail}
              width={900}
            />
          </Link>
        ) : null}
        <div className="preview-card__audio-badge">
          <span className="preview-card__sound-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{item.kicker ?? item.kindLabel}</span>
        </div>
      </div>
      <div className="preview-card__body">
        <h3 className="preview-card__title">
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description">{item.description}</p>
      </div>
      <div className="preview-card__track-row">
        <div className="preview-card__track-meta">
          {item.meta ? <p className="preview-card__meta">{item.meta}</p> : null}
          {item.tags?.[0] ? <span className="preview-card__kicker">{item.tags[0]}</span> : null}
        </div>
        {item.date ? <time dateTime={item.date}>{item.date}</time> : null}
      </div>
    </article>
  );
}

function ExperienceCard({ item }: { item: ContentPreview }) {
  return (
    <article className="preview-card preview-card--web-experiences">
      {item.thumbnail ? (
        <Link
          aria-label={item.title}
          className="preview-card__media preview-card__media--experience"
          href={item.route}
        >
          <Image
            alt={item.title}
            className="preview-card__image"
            height={900}
            src={item.thumbnail}
            width={1200}
          />
        </Link>
      ) : null}
      <div className="preview-card__body">
        <div className="preview-card__topline">
          <span className="preview-card__kind">{item.kindLabel}</span>
          {item.date ? <time dateTime={item.date}>{item.date}</time> : null}
        </div>
        <h3 className="preview-card__title">
          <Link href={item.route}>{item.title}</Link>
        </h3>
        <p className="preview-card__description">{item.description}</p>
      </div>
      <div className="preview-card__detail-list" aria-label="Project details">
        <span className="preview-card__detail">{item.meta ?? "Live preview"}</span>
        <span className="preview-card__detail">Interactive project</span>
      </div>
      <div className="preview-card__cta-row">
        <span className="preview-card__cta-label">Open project</span>
        <Link className="preview-card__cta" href={item.route}>
          View Project
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
