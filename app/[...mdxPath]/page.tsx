import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { notFound } from "next/navigation";

import { CaseStudyMetaPanel } from "@/components/detail-panels";

export async function generateMetadata(props: {
  params: Promise<{ mdxPath: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const section = params.mdxPath[0];

  if (section !== "journal" && section !== "ui-ux-design") {
    return {};
  }

  const { metadata } = await importPage(params.mdxPath);

  return metadata;
}

const generateMdxStaticParams = generateStaticParamsFor("mdxPath");

export async function generateStaticParams() {
  const params = await generateMdxStaticParams();

  return params.filter(({ mdxPath }) => {
    const joinedPath = Array.isArray(mdxPath) ? mdxPath.join("/") : mdxPath;

    if (!joinedPath) return false;

    return (
      joinedPath !== "posts" &&
      joinedPath !== "journal" &&
      joinedPath !== "ui-ux-design" &&
      (joinedPath.startsWith("journal/") || joinedPath.startsWith("ui-ux-design/"))
    );
  });
}

export default async function Page(props: {
  params: Promise<{ mdxPath: string[] }>;
}) {
  const params = await props.params;
  const section = params.mdxPath[0];

  if (section !== "journal" && section !== "ui-ux-design") {
    notFound();
  }

  const { default: MDXContent, metadata } = await importPage(params.mdxPath);
  const frontMatter = metadata as Record<string, unknown>;
  const tags = Array.isArray(frontMatter.tags)
    ? frontMatter.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const detailMetadata = {
    title: typeof frontMatter.title === "string" ? frontMatter.title : undefined,
    description:
      typeof frontMatter.description === "string"
        ? frontMatter.description
        : undefined,
    date: typeof frontMatter.date === "string" ? frontMatter.date : undefined,
    summary:
      typeof frontMatter.summary === "string" ? frontMatter.summary : undefined,
    role: typeof frontMatter.role === "string" ? frontMatter.role : undefined,
    timeline:
      typeof frontMatter.timeline === "string" ? frontMatter.timeline : undefined,
    tools: Array.isArray(frontMatter.tools)
      ? frontMatter.tools.filter((tool): tool is string => typeof tool === "string")
      : [],
  };

  return (
    <article className={`mdx-detail mdx-detail--${section}`}>
      <header className="detail-header">
        <span className="eyebrow">
          {section === "journal" ? "Journal Post" : "Case Study"}
        </span>
        {detailMetadata.title ? (
          <h1 className="detail-title">{detailMetadata.title}</h1>
        ) : null}
        {detailMetadata.description ? (
          <p className="detail-copy">{detailMetadata.description}</p>
        ) : null}
        {section === "ui-ux-design" && detailMetadata.summary ? (
          <p className="detail-summary">{detailMetadata.summary}</p>
        ) : null}
        {detailMetadata.date || tags.length > 0 ? (
          <div className="post-summary__header">
            {detailMetadata.date ? (
              <time className="detail-date" dateTime={detailMetadata.date}>
                {detailMetadata.date}
              </time>
            ) : (
              <span />
            )}
            {tags.length > 0 ? (
              <ul className="post-summary__tags" aria-label="Tags">
                {tags.map((tag) => (
                  <li className="post-summary__tag" key={tag}>
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {section === "ui-ux-design" ? (
          <CaseStudyMetaPanel metadata={detailMetadata} />
        ) : null}
      </header>
      <section className="mdx-detail__body">
        <MDXContent {...props} params={params} />
      </section>
    </article>
  );
}
