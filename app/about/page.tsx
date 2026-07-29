import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Starfield } from "@/components/starfield"
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
      <Starfield count={70} />

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
