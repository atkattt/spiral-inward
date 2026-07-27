"use client"

// TEMPORARY verification harness for the slot-composed self creature.
// Deleted once the milestone/morph/aura behaviour is confirmed in-browser.

import { useState } from "react"
import SelfCreature from "@/components/self/self-creature"
import type { AvatarSignals } from "@/lib/self/avatar-slots"

const CASES: { name: string; signals: AvatarSignals }[] = [
  { name: "birth", signals: { agrees: 0, disagrees: 0, answers: 0, cleared: 0, constellations: 6 } },
  { name: "eyes (1 agree)", signals: { agrees: 1, disagrees: 0, answers: 0, cleared: 0, constellations: 6 } },
  { name: "mouth (1 cleared)", signals: { agrees: 4, disagrees: 1, answers: 1, cleared: 1, constellations: 6 } },
  { name: "sides (half)", signals: { agrees: 9, disagrees: 3, answers: 2, cleared: 3, constellations: 6 } },
  { name: "ears (all)", signals: { agrees: 14, disagrees: 4, answers: 5, cleared: 6, constellations: 6 } },
  { name: "all disagree", signals: { agrees: 0, disagrees: 18, answers: 3, cleared: 6, constellations: 6 } },
]

export default function DevAvatarPage() {
  const [i, setI] = useState(0)
  return (
    <main className="flex min-h-[100dvh] flex-col items-center gap-6 bg-background p-8">
      <div className="flex flex-wrap gap-2">
        {CASES.map((c, idx) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setI(idx)}
            data-case={c.name}
            className={`rounded border px-3 py-1.5 font-mono text-xs ${
              idx === i ? "border-foreground text-foreground" : "border-border text-muted-foreground"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div id="being" className="relative flex items-center justify-center overflow-hidden" style={{ width: 260, height: 260 }}>
        <SelfCreature signals={CASES[i].signals} seed="harness-user" size={260} color="#e8e4da" lcd lcdSize={200} />
      </div>
      <p className="font-mono text-xs text-muted-foreground">{CASES[i].name}</p>
    </main>
  )
}
