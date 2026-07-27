"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  BIRTH_NORMALIZED_KEY,
  CHART_KEY,
  canConsumeBirthStash,
  clearBirthStash,
  readBirthStashStamp,
  stampBirthStash,
} from "@/lib/birth-data"
import {
  ensureUserChart,
  persistBirthChart,
} from "@/app/actions/birth-chart"

type StoredNormalized = {
  date: string
  time: string
  place: string
  placeName?: string
  country?: string
  lat?: number
  lng?: number
  timezone?: string
}

/**
 * Runs once when an authenticated user lands in the spiral. If the onboarding
 * ritual stashed a computed chart in sessionStorage, it persists that chart to
 * the user's profile server-side and clears the temporary keys. Otherwise it
 * asks the server to ensure a chart exists (recomputing from stored birth data,
 * or routing to /onboarding when the profile still holds placeholder data).
 *
 * The stash lives in localStorage, which outlives sign-out — so it is only
 * consumed when it actually belongs to the current user (see
 * canConsumeBirthStash). A stash claimed by a different account, or an
 * abandoned anonymous one that has gone stale, is discarded instead of being
 * silently adopted, which would otherwise hand a brand-new account the
 * previous person's birth chart.
 *
 * Renders nothing.
 */
export function BirthChartBootstrap({ userId }: { userId: string }) {
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function run() {
      let normalized: StoredNormalized | null = null
      let chart: {
        planets: unknown
        ascendant: unknown
        houses: unknown
        dashas: unknown
      } | null = null

      // Refuse a stash that belongs to someone else (or an abandoned anonymous
      // one that has expired) BEFORE reading it, and wipe it so it can't be
      // adopted on a later load either.
      if (!canConsumeBirthStash(userId, readBirthStashStamp())) {
        clearBirthStash()
      } else {
        try {
          // localStorage first (survives new-tab sign-in flows like the email
          // confirm link or OAuth); sessionStorage as a legacy fallback.
          const rawNorm =
            localStorage.getItem(BIRTH_NORMALIZED_KEY) ??
            sessionStorage.getItem(BIRTH_NORMALIZED_KEY)
          const rawChart =
            localStorage.getItem(CHART_KEY) ?? sessionStorage.getItem(CHART_KEY)
          if (rawNorm && rawChart) {
            normalized = JSON.parse(rawNorm)
            chart = JSON.parse(rawChart)
            // Claim it, so a competing tab or a later sign-in as a different
            // account can no longer consume this same chart.
            stampBirthStash(userId)
          }
        } catch {
          normalized = null
          chart = null
        }
      }

      // A fresh chart is waiting from onboarding — persist it.
      if (
        normalized &&
        chart &&
        typeof normalized.lat === "number" &&
        typeof normalized.lng === "number" &&
        normalized.timezone
      ) {
        const place =
          normalized.placeName && normalized.country
            ? `${normalized.placeName}, ${normalized.country}`
            : normalized.placeName || normalized.place

        const res = await persistBirthChart({
          birth: {
            date: normalized.date,
            time: normalized.time,
            place,
            lat: normalized.lat,
            lng: normalized.lng,
            timezone: normalized.timezone,
          },
          chart: {
            planets: chart.planets as never,
            ascendant: chart.ascendant as never,
            houses: chart.houses as never,
            dashas: chart.dashas as never,
          },
        })

        // Only clear on success so a transient failure can retry next load.
        if (res.status === "saved") {
          clearBirthStash()
          // The page server-rendered BEFORE this chart existed, so its
          // matched reads (first star, mini reads, hint text) are empty —
          // re-render the server props now that the chart is saved.
          router.refresh()
        } else if (res.status !== "unauthenticated") {
          console.log("[v0] persistBirthChart:", res)
        }
        return
      }

      // Nothing pending — make sure a chart exists, or route to onboarding.
      const res = await ensureUserChart()
      if (res.status === "needs_onboarding") {
        router.replace("/onboarding")
      } else if (res.status === "ready" && res.recomputed) {
        // Same race as above: the chart was just recomputed from stored
        // birth data, after the empty server render. Refresh to surface it.
        router.refresh()
      } else if (res.status === "error") {
        console.log("[v0] ensureUserChart:", res.message)
      }
    }

    void run()
  }, [router])

  return null
}
