/**
 * GlassPanel — the base building block of the glassmorphic UI revamp.
 *
 * Three tiers (matches `cb-glass-1/2/3` classes in tokens.css):
 *
 *   1 — Sub-panels, sidebars, list rows. Lowest blur, lowest contrast.
 *   2 — Floating cards (chat bubbles, agent tiles, workflow nodes). Medium blur.
 *       Pair with `lift` to enable a subtle hover lift.
 *   3 — Modals, popovers, overlays. Highest blur + teal-tinted border.
 *
 * Every panel gets the inner top-edge sheen + an elevation shadow appropriate
 * for its tier, baked into the `.cb-glass-N` class.
 *
 * Use `as` to render a different element (button, section, aside, etc.) while
 * keeping the glass styling. Forward additional Tailwind classes via `className`.
 *
 * Design language reference: UI Design Revamp.md §3.1 (Glass tiers), §3.4 (Elevation)
 */

import { ElementType, HTMLAttributes, ReactNode } from 'react'

type Tier = 1 | 2 | 3

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  tier?: Tier
  as?: ElementType
  /** Add the hover-lift behaviour (translateY -1px + brighter border on hover) */
  lift?: boolean
  /** Round all corners with the standard panel radius (lg = 20px). Default: true */
  rounded?: boolean | 'sm' | 'md' | 'lg' | 'xl' | 'pill'
  children?: ReactNode
}

const RADIUS_CLASS = {
  sm: 'rounded-cb-sm',
  md: 'rounded-cb-md',
  lg: 'rounded-cb-lg',
  xl: 'rounded-cb-xl',
  pill: 'rounded-cb-pill'
}

export function GlassPanel({
  tier = 2,
  as: Component = 'div',
  lift = false,
  rounded = 'lg',
  className = '',
  children,
  ...rest
}: GlassPanelProps) {
  const tierClass = `cb-glass-${tier}`
  const liftClass = lift ? 'cb-lift' : ''
  const radiusClass =
    rounded === false ? '' :
    rounded === true  ? RADIUS_CLASS.lg :
    RADIUS_CLASS[rounded]

  return (
    <Component
      className={`${tierClass} ${radiusClass} ${liftClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Component>
  )
}
