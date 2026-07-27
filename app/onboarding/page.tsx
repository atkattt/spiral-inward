"use client"

import { useRouter } from "next/navigation"
import { BIRTH_DATA_KEY, stampBirthStash } from "@/lib/birth-data"
import TerminalOnboarding from "@/components/TerminalOnboarding"
import SwirlCloudSky from "@/components/SwirlCloudSky"
import AsciiRippleSky from "@/components/AsciiRippleSky"

export default function OnboardingPage() {
  const router = useRouter()

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-6">
      {/* Faint blueprint grid behind the sky layers (z-0) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Same animated sky field as the welcome screen: clouds (z-0) behind the
          ASCII ripple (z-1), sharing one wave. */}
      <SwirlCloudSky />
      <AsciiRippleSky />

      {/* Onboarding sits on top (z-10) as a translucent glass rectangle */}
      <TerminalOnboarding
        onComplete={(data) => {
        // Birth-data ritual is done. Stash the answers so the account step can
        // read them. localStorage (not sessionStorage) so the stash survives
        // sign-in flows that land in a new tab (email confirm link, OAuth).
        try {
          localStorage.setItem(BIRTH_DATA_KEY, JSON.stringify(data))
          // Stamp it anonymous + now, so a stash that's abandoned here can
          // never be adopted later by a different account on this browser.
          stampBirthStash(null)
        } catch {
          // localStorage may be unavailable (private mode); proceed anyway.
        }
        // The birth-data ritual is done. Hand off to the threshold screen,
        // where the chart "reads" (loads) while the visitor can read the
        // project's story. From there, "enter the spiral" continues to /circle.
        router.push("/threshold")
        }}
      />
    </main>
  )
}
