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

      {/* Wordmark — this may be a visitor's first screen, so the app names
          itself. Letters flicker into ascii glyphs and back, the same feel as
          the loading screen's morphing display. */}
      <Link
        href="/"
        className="absolute top-8 left-1/2 z-10 -translate-x-1/2 font-mono text-[10px] lowercase tracking-[0.25em] text-foreground"
      >
        <GlyphFlickerText text="spiral inward" />
      </Link>

      {/* The button sits at the exact center of the page — which is the center
          of the full-screen spiral — so the animation breathes around it. The
          heading is absolutely positioned above it rather than in flow, which
          would push the button off that center. */}
      <div className="relative z-10 flex w-full max-w-sm items-center justify-center">
        <h1 className="absolute bottom-full left-1/2 mb-10 w-full -translate-x-1/2 text-center font-mono text-sm lowercase tracking-[0.15em] text-foreground text-balance">
          before we start, an account
        </h1>

        <AuthForm mode="sign-up" />
      </div>
    </main>
  )
}
