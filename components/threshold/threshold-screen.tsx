"use client"

import { useEffect, useState } from "react"
import SwirlCloudSky from "@/components/SwirlCloudSky"
import AsciiRippleSky from "@/components/AsciiRippleSky"
import { StoryReadCards } from "@/components/threshold/story-read-cards"
import {
  BIRTH_DATA_KEY,
  BIRTH_NORMALIZED_KEY,
  CHART_KEY,
  normalizeBirthData,
  readBirthStashStamp,
  stampBirthStash,
  type RawBirthData,
} from "@/lib/birth-data"

// The loading stages cycle while the chart "reads". Later this list will be
// driven by the real engine; for now it's a timed simulation (~4.5s total).
const STAGES = [
  "reading your chart…",
  "placing the planets…",
  "tracing your dasha…",
  "drawing the spiral…",
]

// Solid-black accent to match the onboarding glass aesthetic (black text on a
// translucent grey card — no glow). Reused for emphasis words and the CTA.
const glowText = { color: "#000" }

const LOADER_GLYPHS = ["·", ":", "+", "*", "#", "✦", "=", "/", "\\"]
const READY_WORD = "READY?"
const READY_ASCII = ["#", "*", "+", ":", "·", "/"]
const DISPLAY_WIDTH = READY_WORD.length

/**
 * One continuous ASCII display shared by both states, so there is never a
 * remount. While loading, all six cells mutate randomly. When `ready` flips,
 * cells resolve into their READY? letters one at a time (left to right) while
 * the still-unresolved cells keep mutating — the word emerges from the noise.
 * Fully-resolved letters then continue into the gentle infinite flicker loop.
 */
function AsciiMorphDisplay({ ready }: { ready: boolean }) {
  const [glyphs, setGlyphs] = useState(() =>
    Array.from({ length: DISPLAY_WIDTH }, (_, i) => LOADER_GLYPHS[i]),
  )
  // How many cells (from the left) have locked into their final letter.
  const [resolved, setResolved] = useState(0)

  // Loading mutation: scramble only the cells that haven't resolved yet.
  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    if (reduceMotion || resolved >= DISPLAY_WIDTH) return

    const timer = window.setInterval(() => {
      setGlyphs((previous) => {
        const next = [...previous]
        const changes = Math.random() < 0.35 ? 2 : 1
        for (let i = 0; i < changes; i++) {
          const position = resolved + Math.floor(Math.random() * (next.length - resolved))
          let glyph = LOADER_GLYPHS[Math.floor(Math.random() * LOADER_GLYPHS.length)]
          while (glyph === next[position]) {
            glyph = LOADER_GLYPHS[Math.floor(Math.random() * LOADER_GLYPHS.length)]
          }
          next[position] = glyph
        }
        return next
      })
    }, 110)

    return () => window.clearInterval(timer)
  }, [resolved])

  // Resolution: once ready, lock one more cell into its letter every ~150ms.
  useEffect(() => {
    if (!ready) return
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    if (reduceMotion) {
      setResolved(DISPLAY_WIDTH)
      return
    }
    if (resolved >= DISPLAY_WIDTH) return

    const timer = window.setTimeout(() => setResolved((r) => r + 1), 150)
    return () => window.clearTimeout(timer)
  }, [ready, resolved])

  const settled = resolved >= DISPLAY_WIDTH

  return (
    <span
      aria-label={ready ? "Ready?" : "Reading your chart"}
      style={{
        display: "flex",
        color: "#fff",
        fontFamily: '"Geist Pixel", sans-serif',
        fontSize: 22,
        lineHeight: 1,
        textTransform: "uppercase",
        textAlign: "center",
        whiteSpace: "nowrap",
        textShadow: "0 0 8px rgba(255,255,255,0.35)",
      }}
    >
      {Array.from({ length: DISPLAY_WIDTH }, (_, index) => {
        const isResolved = index < resolved
        return (
          <span
            key={index}
            aria-hidden="true"
            style={{
              position: "relative",
              display: "inline-grid",
              width: "0.9em",
              placeItems: "center",
            }}
          >
            {settled ? (
              <>
                <span
                  className="ready-letter"
                  style={{ animation: `readyLetter 2.8s steps(1, end) ${index * 110}ms infinite` }}
                >
                  {READY_WORD[index]}
                </span>
                <span
                  className="ready-ascii"
                  style={{
                    position: "absolute",
                    // Hidden by default so it never overlaps the letter during
                    // the staggered animation-delay before keyframes kick in.
                    opacity: 0,
                    animation: `readyAscii 2.8s steps(1, end) ${index * 110}ms infinite`,
                  }}
                >
                  {READY_ASCII[index]}
                </span>
              </>
            ) : (
              <span
                style={{
                  transition: "opacity 220ms ease",
                  opacity: isResolved ? 1 : 0.85,
                }}
              >
                {isResolved ? READY_WORD[index] : glyphs[index]}
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

export default function ThresholdScreen({ onEnter }: { onEnter: () => void }) {
  const [stage, setStage] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    // Advance through each stage every ~1.1s for the ritual's pacing.
    STAGES.forEach((_, i) => {
      timers.push(setTimeout(() => !cancelled && setStage(i), i * 1100))
    })

    // A minimum on-screen time so a fast read still feels like a "reading"
    // rather than a flash.
    const minDelay = new Promise<void>((res) => setTimeout(res, 4500))

    // The real "read": normalize the onboarding answers, geocode the birth
    // place, then ask the chart engine (the brain) to compute the chart.
    async function computeChart() {
      try {
        // localStorage first (current flow); sessionStorage as a fallback for
        // visitors who started onboarding before the storage switch.
        const rawStr =
          localStorage.getItem(BIRTH_DATA_KEY) ??
          sessionStorage.getItem(BIRTH_DATA_KEY)
        if (!rawStr) {
          throw new Error("we lost your birth details — begin again")
        }
        const raw = JSON.parse(rawStr) as RawBirthData
        const norm = normalizeBirthData(raw)

        if (!norm.place) throw new Error("we need your birth place to read the sky")

        // Prefer the typeahead pick from onboarding — already canonical, with
        // coords + timezone attached. Only fall back to re-geocoding free
        // text for stashes created before the typeahead existed.
        let geo: {
          name: string
          country: string | null
          lat: number
          lng: number
          timezone: string
        }
        if (raw.placePick) {
          geo = {
            name: raw.placePick.name,
            country: raw.placePick.country,
            lat: raw.placePick.lat,
            lng: raw.placePick.lng,
            timezone: raw.placePick.timezone,
          }
        } else {
          const geoRes = await fetch(
            `/api/geocode?q=${encodeURIComponent(norm.place)}`,
          )
          const geoJson = await geoRes.json()
          if (!geoRes.ok) {
            throw new Error(geoJson.error || "couldn't place your birth city")
          }
          geo = geoJson
        }

        const chartRes = await fetch("/api/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: norm.date,
            time: norm.time,
            lat: geo.lat,
            lng: geo.lng,
            timezone: geo.timezone,
          }),
        })
        const chart = await chartRes.json()
        if (!chartRes.ok) {
          throw new Error(chart.error || "the sky wouldn't read")
        }

        // Stash the computed chart + resolved location so the account step and
        // the spiral can use them. localStorage so the stash survives sign-in
        // flows that land in a new tab (email confirm link, OAuth).
        localStorage.setItem(
          BIRTH_NORMALIZED_KEY,
          JSON.stringify({
            ...norm,
            placeName: geo.name,
            country: geo.country,
            lat: geo.lat,
            lng: geo.lng,
            timezone: geo.timezone,
          }),
        )
        localStorage.setItem(CHART_KEY, JSON.stringify(chart))
        // Refresh the provenance stamp, preserving any existing owner (and the
        // original creation time) so the chart can't be adopted by a different
        // account later on this browser.
        stampBirthStash(readBirthStashStamp()?.ownerId ?? null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "the read failed")
        }
      }
    }

    // Reveal the CTA once both the minimum time and the real computation finish.
    Promise.all([computeChart(), minDelay]).then(() => {
      if (!cancelled) setReady(true)
    })

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
      <main className="relative min-h-[100dvh] overflow-y-auto" style={{ marginTop: "-33px" }}>
      {/* Faint blueprint grid behind the sky layers — matches /onboarding. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Same animated sky field as /onboarding and the welcome screen:
          clouds (z-0) behind the ASCII ripple (z-1), sharing one wave. */}
      <SwirlCloudSky />
      <AsciiRippleSky />

      {/* Sticky hero — stays pinned while the story scrolls beneath it. */}
      <div className="sticky top-0 z-20 flex flex-col items-center px-6 pb-0 pt-10" style={{ marginBottom: "-36px" }}>
        <div className="relative z-10 flex flex-col items-center" style={{ gap: "0px" }}>
          {/* Self-avatar disc: the same black disc with a thin near-white outline
              and breathing halo used elsewhere, holding the white loading spiral.
              Pinned at the top so the story text boxes scroll beneath it. */}
          <style>{`
            @keyframes thresholdAvatarHalo {
              0%, 100% { box-shadow: 0 0 18px oklch(0.95 0 0 / 0.10); }
              50% { box-shadow: 0 0 30px oklch(0.95 0 0 / 0.20); }
            }
            @keyframes readyLetter {
              0%, 38%, 62%, 100% { opacity: 1; filter: blur(0); }
              42%, 58% { opacity: 0; filter: blur(2px); }
            }
            @keyframes readyAscii {
              0%, 38%, 62%, 100% { opacity: 0; filter: blur(2px); }
              42%, 58% { opacity: 1; filter: blur(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              @keyframes thresholdAvatarHalo { 0%, 100% { box-shadow: 0 0 20px oklch(0.95 0 0 / 0.14); } }
              .ready-ascii { display: none; }
              .ready-letter { animation: none !important; }
            }
          `}</style>
          <div
            className="relative flex items-center justify-center rounded-full"
            style={{
              width: 168,
              height: 168,
              backgroundColor: "#050505",
              border: "2px solid oklch(0.95 0 0 / 0.6)",
              boxShadow: "0 0 22px oklch(0.95 0 0 / 0.12)",
              animation: "thresholdAvatarHalo 4.5s ease-in-out infinite",
              marginTop: "32px",
            }}
            aria-hidden={ready ? undefined : "true"}
          >
            {/* One continuous ASCII line: mutates while the chart reads, then
                resolves cell-by-cell into "READY?" — no remount, no jump. */}
            <AsciiMorphDisplay ready={ready && !error} />
          </div>

          {/* Cycling status line — shows the loading stages, or the error
              message if the read faltered. On success it stays empty (no
              "found you" label). */}
          <p
            className="mt-6 h-4 text-[11px] uppercase tracking-[0.25em] transition-colors"
            style={{ fontFamily: '"Geist Pixel", sans-serif', color: "#1a1a1a" }}
            aria-live="polite"
          >
            {ready ? (
              error ? (
                <span style={{ ...glowText, fontWeight: 600, fontFamily: '"Geist Pixel", sans-serif' }}>
                  {"the read faltered"}
                </span>
              ) : (
                <span />
              )
            ) : (
              <span>{STAGES[stage]}</span>
            )}
          </p>

          {/* Thin loading bar with a travelling dark sweep. Hidden entirely once
              the read is ready so no solid line remains under the status. */}
          {!ready && (
            <div className="relative mt-5 h-px w-44 overflow-hidden bg-black/20">
              <div
                className="animate-bar-sweep absolute inset-y-0 w-1/4"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(0,0,0,0.7), transparent)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Scrollable story body */}
      <div className="relative z-10 mx-auto max-w-md px-7 pb-44">
        <StoryReadCards />
      </div>

      {/* The handoff CTA — fixed at the bottom, fades/rises in only when the
          read finishes. It waits; it never forces the transition. */}
      {ready && (
        <>
          {/* Frosted glass shelf — kept in its OWN fixed element, OUTSIDE the
              animated CTA wrapper below. The rise-in animation applies a
              `transform` to its host, and a transformed ancestor disables
              `backdrop-filter` on descendants, so the shelf must not live
              inside it. Two layers because combining `mask-image` with
              `backdrop-filter` also disables the blur in Chrome/Safari. */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-52"
          >
            {/* Progressive blur. Each layer covers the whole shelf but carries
                its own soft mask gradient, so instead of a hard top edge every
                layer fades in gradually. Stacking several with increasing blur
                strength produces one continuous, feathered frost with no
                visible step lines. */}
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: "blur(3px)",
                WebkitBackdropFilter: "blur(3px)",
                maskImage: "linear-gradient(to top, #000 40%, transparent 78%)",
                WebkitMaskImage:
                  "linear-gradient(to top, #000 40%, transparent 78%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                maskImage: "linear-gradient(to top, #000 30%, transparent 66%)",
                WebkitMaskImage:
                  "linear-gradient(to top, #000 30%, transparent 66%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: "blur(16px) saturate(140%)",
                WebkitBackdropFilter: "blur(16px) saturate(140%)",
                maskImage: "linear-gradient(to top, #000 22%, transparent 54%)",
                WebkitMaskImage:
                  "linear-gradient(to top, #000 22%, transparent 54%)",
              }}
            />
            {/* Frosted tint on top, fading gently toward the top edge so the
                shelf blends smoothly into the story above. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.72) 40%, rgba(5,5,5,0.32) 68%, transparent 100%)",
              }}
            />
          </div>

          <div className="animate-rise-in fixed inset-x-0 bottom-0 z-30 flex flex-col items-center px-6 pb-8 pt-20">
          <button
            onClick={onEnter}
            className="relative z-10 rounded-full border text-xs uppercase tracking-[0.25em] transition-transform active:scale-95"
            style={{
              ...glowText,
              color: "#fff",
              fontFamily: '"Geist Pixel", sans-serif',
              borderColor: "#fff",
              // Transparent pill — the frosted glass shelf beneath supplies the
              // backdrop, so the story text never shows through the label.
              background: "transparent",
              paddingRight: "21px",
              paddingLeft: "29px",
              paddingTop: "14px",
              paddingBottom: "14px",
            }}
          >
            {"enter the spiral "}
          </button>
          {error ? (
            <p
              className="relative z-10 mt-3 max-w-xs text-center text-[10px] normal-case leading-relaxed tracking-[0.15em]"
              style={{ fontFamily: '"Geist Pixel", sans-serif', color: "#ff0000" }}
            >
              {error}
            </p>
          ) : (
            <p
              className="relative z-10 mt-3 text-[10px] uppercase tracking-[0.25em]"
              style={{ fontFamily: '"Geist Pixel", sans-serif', color: "#fff" }}
            >
              your chart is ready
            </p>
          )}
          </div>
        </>
      )}
    </main>
  )
}
