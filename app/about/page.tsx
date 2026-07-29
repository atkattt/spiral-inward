import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import SwirlCloudSky from "@/components/SwirlCloudSky"
import AsciiRippleSky from "@/components/AsciiRippleSky"
import { StoryReadCards } from "@/components/threshold/story-read-cards"
import { GlyphFlickerText } from "@/components/glyph-flicker-text"

export const metadata = {
  title: "What this is · Spiral Inward",
  description:
    "What Spiral Inward is, and how it works — a mirror that listens before it speaks.",
}

export default function AboutPage() {
  return (
    <main className="relative min-h-[100dvh] overflow-y-auto bg-background">
      {/* The /threshold backdrop, layer-for-layer, because this page shows the
          same story cards and they should read the same. It also fixes them
          properly: a glass card can only refract light that already exists
          behind it, and the flat starfield this replaces gave the blur almost
          nothing to work with. The living sky does.

          Faint blueprint grid first, beneath both sky layers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Clouds (z-0) behind the ASCII ripple (z-1), sharing one wave field.
          Both are `fixed inset-0`, so they stay put while the story scrolls. */}
      <SwirlCloudSky />
      <AsciiRippleSky />

      {/* Header: a quiet way back to the spiral */}
      <header className="relative z-20 flex items-center px-5 pt-6">
        <Link
          href="/circle"
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Link>
      </header>

      <div className="relative z-10 mx-auto max-w-md px-7 pb-24 pt-4">
        {/* The brand mark, breathing, in place of the old "what this is, how
            it works" label — the page's own copy already says that, and the
            nav entry someone tapped to get here was named About.

            Same treatment as the auth pages: lowercase, mono, wide tracking.
            The -mr-[0.25em] cancels the phantom space letter-spacing adds
            after the final character, which would otherwise leave the line
            optically shifted left of true center. It carries the accessible
            name from GlyphFlickerText's aria-label, so this doubles as the
            page's h1 — the element it replaces left the page with none. */}
        <h1 className="-mr-[0.25em] flex justify-center font-mono text-[22px] leading-none lowercase tracking-[0.25em] text-foreground sm:text-[25.2px]">
          <GlyphFlickerText text="spiral inward" />
        </h1>

        {/* Fully rendered, no typing animation — this page is reference copy
            someone opened on purpose. */}
        <StoryReadCards instant />
      </div>
    </main>
  )
}
