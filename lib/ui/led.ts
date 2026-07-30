/**
 * The one LED/LCD screen texture.
 *
 * Every avatar/self surface builds its grid from THIS module. It used to be
 * copy-pasted per component (SelfCreature's `lcd` branch, AmbientCreature, and
 * the read-phase stage), and the copies had drifted: each carried its own RGB
 * sub-pixel triplet, so surfaces rendered at different sizes picked up
 * different apparent hues, and opening a read swapped one copy for another —
 * which read as the texture "changing" mid-transition. One shared definition
 * means a read can't animate to a different texture, because there is only one.
 *
 * DESATURATED ON PURPOSE. The stripes used to be red/green/blue
 * (`rgba(255,60,60)` / `rgba(60,255,120)` / `rgba(80,120,255)`) emulating a
 * physical panel's sub-pixels. At a 2px pitch those tint the surface unevenly
 * and fight the avatar, which is the only thing here that should carry colour.
 * The stripes are now a single neutral grey at three alphas: same lit-panel
 * relief, no hue of its own.
 */

/** Neutral stripe colour. No hue, so it can't tint anything it covers. */
const LED_STRIPE = "216,222,232"

/**
 * Sub-pixel pitch in px. FIXED at 2 so a small avatar reads as the same
 * physical screen as a large one — never scale this to fit a container.
 */
export const LED_PITCH_PX = 2

/**
 * Scanline darkness for the full-screen read-phase field.
 *
 * This is a SINGLE-PASS value. The field used to paint at 0.1 and a second
 * overlay painted 0.1 again on top over the sky, compositing to
 * 1-(1-.1)² ≈ 0.19 there while the strip beside the read sheet — covered by one
 * layer only — stayed at 0.10. Same texture, visibly different tone, with a
 * hard seam along the sheet's top edge. Now exactly one layer paints the
 * texture, so this value is what shows everywhere, and it is set at the
 * stronger end of that old range for a bit more relief.
 */
export const LED_FIELD_GRID_ALPHA = 0.22

/**
 * Stripe boost for the field, for the same reason as above: two passes of the
 * base stripe alpha composited to ~0.0975, so a single pass needs roughly 2x to
 * keep the sub-pixel relief the sky already had.
 */
export const LED_FIELD_STRIPE_BOOST = 2.1

/**
 * The texture, as a `background-image` value.
 *
 * Three stacked layers: neutral vertical sub-pixel stripes, then a horizontal
 * and a vertical black scanline grid. All offsets are absolute px, so the pitch
 * survives any container size.
 *
 * @param gridAlpha darkness of the scanlines (0-1).
 * @param stripeBoost multiplier on the sub-pixel stripe alphas. Defaults to 1
 *   (the avatar-surface value); the full-screen field passes ~2 because it
 *   paints in one pass where it used to composite two.
 */
export function ledTexture(gridAlpha: number, stripeBoost = 1): string {
  const edge = (0.05 * stripeBoost).toFixed(4)
  const mid = (0.035 * stripeBoost).toFixed(4)
  return `repeating-linear-gradient(to right,
      rgba(${LED_STRIPE},${edge}) 0 .67px,
      rgba(${LED_STRIPE},${mid}) .67px 1.33px,
      rgba(${LED_STRIPE},${edge}) 1.33px 2px),
    repeating-linear-gradient(to bottom,
      transparent 0 1px, rgba(0,0,0,${gridAlpha}) 1px 2px),
    repeating-linear-gradient(to right,
      transparent 0 1px, rgba(0,0,0,${gridAlpha}) 1px 2px)`
}
