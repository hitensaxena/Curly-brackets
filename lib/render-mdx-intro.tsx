import type { ReactNode } from "react";

export function renderMdxIntro(
  metadata: Record<string, unknown>,
  children: ReactNode,
) {
  return (
    <section className="intro-block">
      <span className="eyebrow">Featured Section</span>
      {typeof metadata.title === "string" ? (
        <h1 className="section-title">{metadata.title}</h1>
      ) : null}
      {typeof metadata.description === "string" ? (
        <p className="section-copy">{metadata.description}</p>
      ) : null}
      <div className="intro-rich">{children}</div>
    </section>
  );
}
