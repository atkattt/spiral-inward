import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Starfield } from "@/components/starfield"
import { StoryReadCards } from "@/components/threshold/story-read-cards"

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
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
          What this is, how it works
        </p>

        {/* Fully rendered, no typing animation — this page is reference copy
            someone opened on purpose. */}
        <StoryReadCards instant />
      </div>
    </main>
  )
}
