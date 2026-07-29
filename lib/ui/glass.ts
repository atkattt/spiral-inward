import type { CSSProperties } from "react"

/**
 * The house glass surface — translucent grey over a blur, so the sky stays
 * faintly visible through the panel instead of being covered by a flat fill.
 *
 * Values are taken from the original hand-rolled surfaces in
 * components/threshold/story-read-cards.tsx and components/spiral/self-view.tsx,
 * which are the visual reference for every "text box" in the app.
 *
 * Shared rather than copied per-dialog on purpose: these numbers only work as a
 * set, and the panels that drifted away from them are exactly the ones that
 * ended up looking off-brand.
 *
 * Two things to know when applying this to a shadcn Dialog:
 *
 *  1. Spread it into `style`, NOT into a className. The Dialog primitive ships
 *     `bg-popover` as a class, and `--popover` is oklch(0.19 0.025 275) — chroma
 *     at hue 275 reads as navy blue. The inline `background` shorthand reliably
 *     wins over that class; `backgroundColor` is less dependable against it.
 *  2. Pair it with `ring-0`, since the primitive's `ring-1` would otherwise draw
 *     a second hairline immediately outside this border.
 */
/**
 * WHY THIS ISN'T A FLAT FILL
 *
 * The previous version was a single `rgba(120,120,120,0.30)` over a blur. That
 * reads as glass over the spiral — which is bright and busy — but over a nearly
 * black page (/about is `lab(0 0 0)` with 70 one-pixel stars) it composites to a
 * dead flat #363636 slab. `backdrop-filter` can only redistribute light that is
 * already behind the panel, and blurring black by 12px yields black, so on a
 * dark page there is nothing for it to work with.
 *
 * Real glass reads as glass because of light ON the pane, not only what shows
 * through it. So the surface now supplies its own:
 *
 *  - a directional sheen (`165deg`, brighter at the top-left shoulder, falling
 *    off toward the bottom) instead of one uniform tone,
 *  - a bright top inset edge where light catches the lip,
 *  - a dark bottom inset so the pane has thickness rather than being a sticker.
 *
 * Mean opacity is kept close to the old flat value on purpose: these panels also
 * host white body text over the busy spiral, and going much more transparent
 * would cost legibility there.
 */
export const glassPanelStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 13,
  // Topmost layer first. The gradient is the sheen; the flat grey underneath is
  // the body of the pane, keeping text legible when nothing is behind it.
  // The base alpha is deliberately 0.20 rather than lower: composited with the
  // sheen it lands at ~0.31 at the top (matching the old flat 0.30) and ~0.22 at
  // the bottom. Dropping the base further looked glassier in isolation but thinned
  // the foot of the panel to ~0.19, and these same panels host white body text
  // over the bright spiral — that's the surface where contrast is tightest.
  background:
    "linear-gradient(165deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.02) 100%), rgba(122,122,128,0.20)",
  // brightness() lifts whatever IS behind the panel so the refraction reads;
  // it's a no-op against pure black, which is why the gradient above carries
  // the effect on dark pages.
  backdropFilter: "blur(14px) saturate(150%) brightness(115%)",
  WebkitBackdropFilter: "blur(14px) saturate(150%) brightness(115%)",
  boxShadow:
    "0 16px 40px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.22)",
}

/**
 * Panel width for centered dialogs on the mobile surface.
 *
 * 300px leaves ~30px of sky down each side at 360px wide. The glass needs
 * visible background beside it to read as glass at all, so this pulls in from
 * the primitive's default max-w-[calc(100%-2rem)].
 */
export const GLASS_DIALOG_WIDTH = "max-w-[300px] sm:max-w-xs"
