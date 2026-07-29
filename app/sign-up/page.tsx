import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import SwirlCloudSky from "@/components/SwirlCloudSky"
import AsciiRippleSky from "@/components/AsciiRippleSky"
import { AuthForm } from "@/components/auth-form"
import { GlyphFlickerText } from "@/components/glyph-flicker-text"

export default async function SignUpPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect("/circle")

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16">
      {/* The same breathing ascii spiral sky as the landing screen — the exact
          components and timing, not a copy. Both layers are fixed, aria-hidden
          and pointer-events-none, so the button below stays tappable from the
          first paint and the canvas can never intercept a tap. Reduced-motion
          handling lives in AsciiRippleSky: it paints a single static frame and
          never schedules another. */}
      <SwirlCloudSky />
      <AsciiRippleSky />

      {/* Removing the visible heading left the page with no h1. Keeping one
          for screen readers preserves the document outline without putting
          copy back on screen. */}
      <h1 className="sr-only">Create your spiral inward account</h1>

      {/* The button sits at the exact center of the page — which is the center
          of the full-screen spiral — so the animation breathes around it. The
          wordmark is absolutely positioned above it rather than in flow, which
          would push the button off that center.

          `inline-flex` (not w-full/max-w-sm) makes this wrapper shrink to the
          button's intrinsic width, so the wordmark's `w-full` below resolves to
          exactly the button width. */}
      <div className="relative z-10 inline-flex items-center justify-center">
        {/* Wordmark — this may be a visitor's first screen, so the app names
            itself. Letters flicker into ascii glyphs and back, the same feel as
            the loading screen's morphing display. Sits just above the button
            and matches its width.

            Back on the original 0.25em tracking; the width match now comes from
            scaling the type instead of stretching the gaps. The negative right
            margin cancels the trailing letter-space CSS adds after the final
            character, which would otherwise leave the line looking shifted
            left of the button edge. */}
        <Link
          href="/"
          aria-label="spiral inward — home"
          className="absolute bottom-full left-0 mb-4 -mr-[0.25em] flex w-full justify-center font-mono text-[25.2px] leading-none tracking-[0.25em] lowercase text-foreground"
        >
          <GlyphFlickerText text="spiral inward" />
        </Link>

        <AuthForm mode="sign-up" />
      </div>
    </main>
  )
}
