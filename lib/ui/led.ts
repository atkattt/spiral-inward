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
 * This is a SINGLE-PASS value (the field paints black only; one overlay paints
 * the texture — see universe-read-panel).
 *
 * Raising this does NOT grey out the background. The scanlines are pure black
 * and the field beneath them is opaque `#000`, so over empty background they
 * composite to nothing. What they DO affect is bright content the overlay sits
 * above — the avatar's glyphs and their glow — where they carve the light into a
 * dot matrix. So this is the "how much does the face look like a screen" knob,
 * and it is safe to push.
 */
export const LED_FIELD_GRID_ALPHA = 0.34

/**
 * Stripe brightness for the field. THIS is the knob that decides how black the
 * background looks, because the neutral stripes are the only part of the texture
 * that adds light to an otherwise pure-black field.
 *
 * Held below 1 (i.e. dimmer than an avatar surface) deliberately. It was briefly
 * 2.1 — chosen to match the luminance of an earlier two-pass composite — and
 * across a whole viewport that much lift stopped reading as "black screen with
 * texture" and started reading as flat charcoal grey. The texture stays legible
 * at this level because what makes it visible is the CONTRAST between the edge
 * and mid stripe alphas, not their absolute brightness.
 */
export const LED_FIELD_STRIPE_BOOST = 0.8

/**
 * Centre-stripe scale for the field — see `midScale` on `ledTexture`. Deepens
 * the gap between each sub-pixel's edges and its centre, so the grid still reads
 * crisply at the dimmer brightness above instead of flattening into a haze.
 */
export const LED_FIELD_STRIPE_MID_SCALE = 0.5

/**
 * Corner radius of the read sheet, in px.
 *
 * Shared with the LED overlay, which cuts the sheet out of itself and has to
 * round that cutout by exactly this much. Hard-coding it in both places left a
 * square notch of texture poking outside the sheet's rounded border.
 */
export const LED_SHEET_RADIUS_PX = 20

/**
 * Style props that punch a sheet-shaped hole in a full-viewport layer, with the
 * sheet's rounded top corners.
 *
 * Built as a rounded-rect SVG mask rather than a `clip-path` polygon because a
 * polygon has only straight edges: against the sheet's 20px corners it cut a
 * square, leaving a notch of texture outside the rounded border.
 *
 * The rect is drawn `2 * radius` TALLER than the sheet so its bottom corners
 * round off below the viewport. The sheet sits flush with the bottom edge, so
 * only its top corners are ever visible — and `rx` rounds all four. Overshooting
 * is cheaper and less brittle than hand-writing a path with two arcs.
 *
 * @param left sheet's left edge, viewport px.
 * @param top sheet's top edge, viewport px.
 * @param width sheet's width, px.
 * @param height sheet's visible height from `top` to the viewport bottom, px.
 */
export function sheetHoleMask({
  left,
  top,
  width,
  height,
}: {
  left: number
  top: number
  width: number
  height: number
}): Record<string, string> {
  if (width <= 0 || height <= 0) return {}

  const r = LED_SHEET_RADIUS_PX
  const h = height + r * 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">` +
    `<rect width="${width}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`

  // Layer 1 = the hole, layer 2 = full cover. `exclude` subtracts 1 from 2.
  const image = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}"), linear-gradient(#fff,#fff)`
  const position = `${left}px ${top}px, 0 0`
  const size = `${width}px ${h}px, 100% 100%`
  const repeat = "no-repeat, no-repeat"

  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskPosition: position,
    WebkitMaskPosition: position,
    maskSize: size,
    WebkitMaskSize: size,
    maskRepeat: repeat,
    WebkitMaskRepeat: repeat,
    maskComposite: "exclude",
    // Safari's older name for the same operation.
    WebkitMaskComposite: "xor",
  }
}

/**
 * The texture, as a `background-image` value.
 *
 * Three stacked layers: neutral vertical sub-pixel stripes, then a horizontal
 * and a vertical black scanline grid. All offsets are absolute px, so the pitch
 * survives any container size.
 *
 * @param gridAlpha darkness of the scanlines (0-1).
 * @param stripeBoost multiplier on the sub-pixel stripe alphas — i.e. overall
 *   brightness. Defaults to 1 (the avatar-surface value); the full-screen field
 *   passes less than 1 to stay black rather than grey.
 * @param midScale extra multiplier on the CENTRE stripe only, which widens the
 *   gap between edge and centre. This is how the field keeps a crisp texture
 *   while dimmer overall: perceived detail comes from the edge-to-centre
 *   contrast, so deepening the centre buys back the definition that dropping
 *   `stripeBoost` would otherwise cost, without adding any light back.
 */
export function ledTexture(
  gridAlpha: number,
  stripeBoost = 1,
  midScale = 1,
): string {
  const edge = (0.05 * stripeBoost).toFixed(4)
  const mid = (0.035 * stripeBoost * midScale).toFixed(4)
  return `repeating-linear-gradient(to right,
      rgba(${LED_STRIPE},${edge}) 0 .67px,
      rgba(${LED_STRIPE},${mid}) .67px 1.33px,
      rgba(${LED_STRIPE},${edge}) 1.33px 2px),
    repeating-linear-gradient(to bottom,
      transparent 0 1px, rgba(0,0,0,${gridAlpha}) 1px 2px),
    repeating-linear-gradient(to right,
      transparent 0 1px, rgba(0,0,0,${gridAlpha}) 1px 2px)`
}
