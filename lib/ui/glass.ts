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

/**
 * The LED/LCD screen overlay: RGB sub-pixel stripes + a scanline grid laid OVER
 * a panel's content, with an inner vignette so the surface reads as a lit screen
 * rather than flat glass or plain text.
 *
 * Values come from SelfCreature's `lcd` branch, which is the reference. Shared
 * as a function because this is now on four surfaces (the /self avatar, the
 * landing creature, the onboarding card, the story cards) and the glass values
 * right above already taught us what happens when such a set gets copied per
 * call site: the copies drift and the panels go off-brand.
 *
 * The sub-pixel pitch is FIXED at 2px, exactly as in the original. That is
 * deliberate and should not be scaled per panel: a real screen has one physical
 * pixel size, so a small avatar and a full-height card must show the same pitch
 * to read as the same device.
 *
 * Apply to an `absolute inset-0` element that is the LAST child of a
 * `position: relative` panel, with `aria-hidden` (it is pure decoration) and
 * `pointerEvents: "none"` so anything interactive underneath still receives
 * clicks. Note `inset: 0` resolves against the PADDING box, so a 1px glass
 * border stays crisp outside the grid instead of being overprinted.
 */
export function ledOverlayStyle({
  radius,
  gridAlpha = 0.16,
  vignetteBlur = 60,
  vignetteSpread = 14,
  vignetteAlpha = 0.45,
}: {
  /** Match the panel's own border radius so the grid follows its corners. */
  radius: number
  /**
   * Scanline darkness. 0.16 is the avatar's value and suits pure glyph art;
   * drop to ~0.10 on panels holding real body copy, where the darker grid
   * starts to fringe the type.
   */
  gridAlpha?: number
  vignetteBlur?: number
  vignetteSpread?: number
  vignetteAlpha?: number
}): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    borderRadius: radius,
    boxShadow: `inset 0 0 ${vignetteBlur}px ${vignetteSpread}px rgba(0,0,0,${vignetteAlpha})`,
    backgroundImage: `repeating-linear-gradient(to right,
        rgba(255,60,60,.05) 0 .67px,
        rgba(60,255,120,.05) .67px 1.33px,
        rgba(80,120,255,.05) 1.33px 2px),
      repeating-linear-gradient(to bottom,
        transparent 0 1px, rgba(0,0,0,${gridAlpha}) 1px 2px),
      repeating-linear-gradient(to right,
        transparent 0 1px, rgba(0,0,0,${gridAlpha}) 1px 2px)`,
  }
}
