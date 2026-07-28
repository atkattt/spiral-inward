"use client"

import { useEffect, useRef } from "react"
import { SKY_CELL, skyField } from "@/lib/sky-field"

/**
 * A rendered sky that sits BEHIND the AsciiRippleSky on the landing page.
 *
 * It reads from the SAME shared wave field (lib/sky-field) as the ripple, so
 * the clouds gather and drift exactly where the ASCII glyphs brighten — the two
 * layers are one field drawn two ways.
 *
 *  - Day  (06:00–18:59 local): swirled clouds over a blue sky gradient.
 *  - Night (19:00–05:59 local): a clear, gently twinkling starfield.
 *
 * Performance: the cloud field is computed at ~1/6 resolution into a small
 * offscreen buffer and scaled up (the upscale doubles as a soft blur), and the
 * loop is capped near 30fps. prefers-reduced-motion renders a single static
 * frame. This is the heaviest visual in the app, so it stays cheap on purpose.
 */

type RGB = [number, number, number]
// The app's void: a near-black base (#050505 → #0d0d0d) with a dim, moonlit
// grey cloud bloom. No blue, no day/night split — this matches the greyscale
// nebula treatment of the /circle universe.
const VOID: { sky: RGB; sky2: RGB; cloud: RGB } = {
  sky: [5, 5, 5],
  sky2: [13, 13, 13],
  cloud: [128, 134, 148],
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export default function SwirlCloudSky() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const PA = VOID
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches

    // ---- tiny value-noise (fBm) for cloud texture -------------------------
    const perm = new Uint8Array(512)
    {
      const p: number[] = []
      for (let i = 0; i < 256; i++) p[i] = i
      for (let i = 255; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        ;[p[i], p[j]] = [p[j], p[i]]
      }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
    }
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
    const grad = (h: number, x: number, y: number) => {
      switch (h & 3) {
        case 0:
          return x + y
        case 1:
          return -x + y
        case 2:
          return x - y
        default:
          return -x - y
      }
    }
    const vnoise = (x: number, y: number) => {
      const X = Math.floor(x) & 255
      const Y = Math.floor(y) & 255
      x -= Math.floor(x)
      y -= Math.floor(y)
      const u = fade(x)
      const v = fade(y)
      const aa = perm[perm[X] + Y]
      const ab = perm[perm[X] + Y + 1]
      const ba = perm[perm[X + 1] + Y]
      const bb = perm[perm[X + 1] + Y + 1]
      return lerp(
        lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
        lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
        v,
      )
    }
    const fbm = (x: number, y: number) => {
      let v = 0
      let a = 0.5
      let f = 1
      for (let i = 0; i < 4; i++) {
        v += a * vnoise(x * f, y * f)
        f *= 2
        a *= 0.5
      }
      return v // ~ -1..1
    }

    // ---- sizing -----------------------------------------------------------
    let W = 0
    let H = 0
    let dpr = 1
    let cols = 0
    let rows = 0
    // Low-res offscreen buffer for the cloud field (perf).
    const buffer = document.createElement("canvas")
    const bctx = buffer.getContext("2d")
    let bw = 0
    let bh = 0
    let bimg: ImageData | null = null

    // Declared as arrow consts (not hoisted `function`s) so TypeScript keeps
    // the non-null narrowing of `canvas`/`ctx` from the guards above.
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      // Ripple grid dimensions (CSS px / cell) — must match AsciiRippleSky so
      // the wave lines up between layers.
      cols = Math.ceil(W / SKY_CELL)
      rows = Math.ceil(H / SKY_CELL)
      // Cloud buffer at ~1/6 resolution.
      bw = Math.max(80, Math.floor(W / 6))
      bh = Math.max(80, Math.floor(H / 6))
      buffer.width = bw
      buffer.height = bh
      bimg = bctx ? bctx.createImageData(bw, bh) : null
    }
    resize()
    window.addEventListener("resize", resize)

    // ---- render -----------------------------------------------------------
    const renderDay = (t: number) => {
      if (!bctx || !bimg) return
      const d = bimg.data
      for (let y = 0; y < bh; y++) {
        // vertical sky gradient
        const gy = y / bh
        const sr = lerp(PA.sky[0], PA.sky2[0], gy)
        const sg = lerp(PA.sky[1], PA.sky2[1], gy)
        const sb = lerp(PA.sky[2], PA.sky2[2], gy)
        // map buffer row -> ripple grid row
        const r = (y / bh) * rows
        for (let x = 0; x < bw; x++) {
          const idx = (y * bw + x) * 4
          const c = (x / bw) * cols
          const n = skyField(c, r, cols, rows, t)
          // only the upper half of the wave becomes cloud -> blue-sky gaps
          let cloud = Math.pow(Math.max(0, n - 0.5) / 0.5, 1.1)
          if (cloud > 0.02) {
            // texture so it reads as cloud, not smooth bands
            const tex = fbm(x * 0.05 + t * 0.02, y * 0.05) + 0.75
            cloud = Math.min(1, cloud * tex * 1.05)
          }
          d[idx] = lerp(sr, PA.cloud[0], Math.max(0, cloud))
          d[idx + 1] = lerp(sg, PA.cloud[1], Math.max(0, cloud))
          d[idx + 2] = lerp(sb, PA.cloud[2], Math.max(0, cloud))
          d[idx + 3] = 255
        }
      }
      bctx.putImageData(bimg, 0, 0)
      // scale the low-res buffer up to full size — the upscale softens it into
      // fog for free.
      ctx.drawImage(buffer, 0, 0, W, H)
    }

    let raf = 0
    let last = 0
    const start = performance.now()

    const loop = (now: number) => {
      // Pause the (expensive) cloud render entirely while the tab is hidden.
      if (typeof document !== "undefined" && document.hidden) {
        raf = requestAnimationFrame(loop)
        return
      }
      // clouds are expensive — cap near 30fps
      if (now - last > 33) {
        const t = (now - start) / 1000
        renderDay(t)
        last = now
      }
      raf = requestAnimationFrame(loop)
    }

    if (reduceMotion) {
      renderDay(0) // single static frame
    } else {
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  )
}
