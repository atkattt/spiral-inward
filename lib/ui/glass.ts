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
export const glassPanelStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 13,
  background: "rgba(120,120,120,0.30)",
  backdropFilter: "blur(12px) saturate(120%)",
  WebkitBackdropFilter: "blur(12px) saturate(120%)",
  boxShadow:
    "0 16px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.14)",
}

/**
 * Panel width for centered dialogs on the mobile surface.
 *
 * 300px leaves ~30px of sky down each side at 360px wide. The glass needs
 * visible background beside it to read as glass at all, so this pulls in from
 * the primitive's default max-w-[calc(100%-2rem)].
 */
export const GLASS_DIALOG_WIDTH = "max-w-[300px] sm:max-w-xs"
