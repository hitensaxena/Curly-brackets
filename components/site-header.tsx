import Link from "next/link";

import { sections } from "@/lib/content";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-brand" href="/">
          <span className="site-brand__mark">MP</span>
          <span className="site-brand__copy">
            <span className="site-brand__name">Minimal Portfolio</span>
            <span className="site-brand__subline">Essays, studies, art, tracks, experiments</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="site-nav">
          {sections.map((section) => (
            <Link className="site-nav__link" href={section.href} key={section.key}>
              {section.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
