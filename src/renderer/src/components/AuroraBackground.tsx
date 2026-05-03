/**
 * AuroraBackground — the ambient backdrop for every glass surface in Curly Brackets.
 *
 * Three stacked radial-gradient layers (teal · cyan · violet bleed) animate slowly
 * via the `cb-aurora` keyframes. The whole assembly sits at z-index 0 with
 * pointer-events:none, so nothing else has to know it's there.
 *
 * Performance:
 *  - Only the transform animates → GPU-friendly compositor-only animation
 *  - Pauses when the window loses focus (battery saver)
 *  - Honours prefers-reduced-motion via the .cb-aurora-layer rule in tokens.css
 *
 * Accessibility:
 *  - Pure decoration, hidden from screen readers via aria-hidden
 *
 * Design language reference: UI Design Revamp.md §3.1, §4.1
 */

import { useEffect, useState } from 'react'

export function AuroraBackground() {
  const [paused, setPaused] = useState(false)

  // Pause animation when the window blurs (saves battery on idle laptops)
  useEffect(() => {
    const onBlur = () => setPaused(true)
    const onFocus = () => setPaused(false)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0, background: 'var(--cb-aurora-base)' }}
    >
      {/* Layer 1 — teal mass, top-left, drifts to the right */}
      <div
        className="cb-aurora-layer absolute"
        style={{
          left: '-20%',
          top: '-20%',
          width: '90vw',
          height: '90vh',
          background:
            'radial-gradient(closest-side, rgba(20, 184, 166, 0.55) 0%, rgba(20, 184, 166, 0) 70%)',
          filter: 'blur(60px)',
          animation: paused ? 'none' : 'cb-aurora 90s linear infinite',
          willChange: 'transform'
        }}
      />
      {/* Layer 2 — cyan mass, mid-right, drifts the other way */}
      <div
        className="cb-aurora-layer absolute"
        style={{
          right: '-25%',
          top: '15%',
          width: '85vw',
          height: '85vh',
          background:
            'radial-gradient(closest-side, rgba(94, 234, 212, 0.40) 0%, rgba(94, 234, 212, 0) 70%)',
          filter: 'blur(70px)',
          animation: paused ? 'none' : 'cb-aurora 110s linear infinite reverse',
          willChange: 'transform'
        }}
      />
      {/* Layer 3 — violet bleed, bottom, slow swirl for color variety */}
      <div
        className="cb-aurora-layer absolute"
        style={{
          left: '10%',
          bottom: '-30%',
          width: '100vw',
          height: '80vh',
          background:
            'radial-gradient(closest-side, rgba(139, 109, 255, 0.30) 0%, rgba(139, 109, 255, 0) 70%)',
          filter: 'blur(80px)',
          animation: paused ? 'none' : 'cb-aurora 140s linear infinite',
          willChange: 'transform'
        }}
      />
      {/* Subtle vignette to keep edges from feeling washed out */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(2, 20, 26, 0.6) 100%)'
        }}
      />
    </div>
  )
}
