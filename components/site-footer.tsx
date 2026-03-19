import Link from "next/link";

import { sections } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__copy">
          A quieter home for writing, case studies, image work, music, and web
          experiments collected in one place.
        </p>
        <nav aria-label="Footer" className="site-footer__nav">
          {sections.map((section) => (
            <Link className="site-footer__link" href={section.href} key={section.key}>
              {section.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
