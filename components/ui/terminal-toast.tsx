"use client"

/**
 * TERMINAL TOASTS
 *
 * Drop-in replacement for sonner's `toast`. Every notice in the app prints
 * itself out like a line in a terminal: `›` prompt, characters typing in, a
 * blinking block cursor while it runs — the same signature already used by the
 * story cards, self view, and avatar read sheet.
 *
 * Why a wrapper instead of just restyling the Toaster: sonner renders its own
 * box around `title`, so animated content plus a guaranteed grey/outlined shell
 * is only fully controllable through `toast.custom`. Doing it here means the
 * 14 existing call sites only change their import, not their arguments.
 *
 * The API deliberately mirrors sonner's (`toast(msg, { description })`, plus
 * `.success` / `.error`) so call sites read identically.
 */

import { useEffect, useRef, useState } from "react"
import { toast as sonnerToast } from "sonner"

/** Shell: matches the app's other text boxes (grey + hairline outline). */
const SHELL_BG = "#232323"
const SHELL_BORDER = "rgba(255,255,255,0.16)"
const MONO = "var(--font-mono)"

/** Prompt glyph + tint per tone. Errors get a warm tint; nothing else does, so
 *  the palette stays at grey + white + one accent. */
const TONES = {
  default: { glyph: "›", tint: "#cfcfcf" },
  success: { glyph: "✓", tint: "#cfcfcf" },
  error: { glyph: "!", tint: "#e0a08b" },
} as const

type Tone = keyof typeof TONES

/** Typing cadence — 2 chars per 14ms tick, matching TypedLine elsewhere. */
const CHARS_PER_TICK = 2
const TICK_MS = 14
const START_DELAY_MS = 120

function typingDurationMs(len: number) {
  return START_DELAY_MS + Math.ceil(len / CHARS_PER_TICK) * TICK_MS
}

function TerminalToastBody({
  message,
  description,
  tone,
}: {
  message: string
  description?: string
  tone: Tone
}) {
  const { glyph, tint } = TONES[tone]
  // Start fully typed when reduced motion is preferred; the ref-free initial
  // state stays deterministic so SSR/hydration never mismatch.
  const [count, setCount] = useState(0)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
    if (reduced.current) {
      setCount(message.length)
      return
    }
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      i = Math.min(message.length, i + CHARS_PER_TICK)
      setCount(i)
      if (i < message.length) timer = setTimeout(tick, TICK_MS)
    }
    timer = setTimeout(tick, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [message])

  const typing = count < message.length

  return (
    <div
      // Full width of sonner's slot so it reads as a terminal strip on mobile.
      className="flex w-full items-start gap-2"
      style={{
        backgroundColor: SHELL_BG,
        border: `1px solid ${SHELL_BORDER}`,
        borderRadius: 10,
        padding: "13px 15px",
        fontFamily: MONO,
        // Sits above the spiral's glow without picking up its blue cast.
        boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: tint,
          fontSize: 13,
          lineHeight: 1.5,
          flexShrink: 0,
        }}
      >
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.92)",
            fontSize: 13,
            lineHeight: 1.5,
            letterSpacing: 0.3,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message.slice(0, count)}
          {typing && (
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 7,
                height: 14,
                background: "#fff",
                marginLeft: 1,
                verticalAlign: -2,
                animation: "ttBlink 1.05s steps(1) infinite",
              }}
            />
          )}
        </p>
        {description ? (
          <p
            style={{
              margin: "5px 0 0",
              color: "rgba(255,255,255,0.6)",
              fontSize: 12,
              lineHeight: 1.5,
              letterSpacing: 0.2,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              // Held back until the line above finishes printing, so the two
              // don't animate over each other.
              opacity: typing ? 0 : 1,
              transition: "opacity .25s ease",
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      <style>{`@keyframes ttBlink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}

type TerminalToastOptions = {
  description?: string
  duration?: number
  id?: string | number
}

function show(tone: Tone, message: string, opts?: TerminalToastOptions) {
  const text = String(message ?? "")
  return sonnerToast.custom(
    () => (
      <TerminalToastBody
        message={text}
        description={opts?.description}
        tone={tone}
      />
    ),
    {
      // Long messages must not dismiss mid-type, so the floor scales with the
      // typing time rather than trusting sonner's fixed default.
      duration: opts?.duration ?? typingDurationMs(text.length) + 3400,
      id: opts?.id,
    },
  )
}

/** Screen-reader announcement is handled by sonner's live region wrapper. */
export const toast = Object.assign(
  (message: string, opts?: TerminalToastOptions) =>
    show("default", message, opts),
  {
    success: (message: string, opts?: TerminalToastOptions) =>
      show("success", message, opts),
    error: (message: string, opts?: TerminalToastOptions) =>
      show("error", message, opts),
    dismiss: sonnerToast.dismiss,
  },
)
