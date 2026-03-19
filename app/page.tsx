import { LandingSection } from "@/components/landing-section";
import { getHomepageCollections, sectionConfig } from "@/lib/content";

export default async function HomePage() {
  const collections = await getHomepageCollections();

  return (
    <div className="page-stack">
      <section className="hero-block hero-block--home">
        <div className="hero-block__copy">
          <span className="eyebrow">Creative Portfolio</span>
          <h1 className="hero-title">Notes, interfaces, images, signals.</h1>
          <p className="hero-copy">
            A selective front page for journal entries, case studies, digital
            art, music sketches, and browser-native experiments.
          </p>
        </div>
        <div className="hero-block__stats">
          <div className="hero-stat">
            <span className="hero-stat__label">Writing</span>
            <strong>Essays, observations, working notes</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat__label">Practice</span>
            <strong>Design systems, images, tracks, prototypes</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat__label">Approach</span>
            <strong>Different mediums, one calm reading rhythm</strong>
          </div>
        </div>
      </section>

      {collections.map(({ section, items }) => (
        <LandingSection
          key={section}
          items={items}
          section={sectionConfig[section]}
        />
      ))}
    </div>
  );
}
