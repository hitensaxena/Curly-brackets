"use client";

import Link from "next/link";
import { useState } from "react";

const navLinks = [
  { key: "journal", label: "Journal", href: "/journal" },
  { key: "ui-ux-design", label: "UI/UX Design", href: "/ui-ux-design" },
  { key: "digital-art", label: "Digital Art", href: "/digital-art" },
  { key: "music", label: "Music", href: "/music" },
  { key: "web-experiences", label: "Web Experiences", href: "/web-experiences" },
];

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="site-header">
      <div className={`site-header__inner ${isOpen ? "is-open" : ""}`}>
        <div className="site-header__top">
          <Link className="site-brand" href="/" onClick={() => setIsOpen(false)}>
            <span className="site-brand__mark">MP</span>
            <span className="site-brand__copy">
              <span className="site-brand__name">Minimal Portfolio</span>
              <span className="site-brand__subline">Essays, studies, art, tracks, experiments</span>
            </span>
          </Link>
          
          <button 
            className="mobile-menu-toggle" 
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            <span className="menu-icon-line" />
            <span className="menu-icon-line" />
            <span className="menu-icon-line" />
          </button>
        </div>
        
        <nav aria-label="Primary" className={`site-nav ${isOpen ? "site-nav--open" : ""}`}>
          {navLinks.map((section) => (
            <Link 
              className="site-nav__link" 
              href={section.href} 
              key={section.key}
              onClick={() => setIsOpen(false)}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
