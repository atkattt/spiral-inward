"use client"

import { useEffect, useRef, useState } from "react"
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
import { SkySettlingOverlay } from "@/components/sky-settling-overlay"

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
export function BirthChartBootstrap({
  userId,
  hasChart = true,
}: {
  userId: string
  /**
   * Whether the server render that mounted this already had a chart. Defaults
   * to true so any other caller keeps the old invisible behaviour.
   */
  hasChart?: boolean
}) {
  const router = useRouter()
  const ran = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)

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
          // Surface it — otherwise the overlay would spin forever on a render
          // that has no reads to show.
          setFailed(
            res.status === "error" ? res.message : "your chart didn't save",
          )
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
        setFailed(res.message)
      } else if (res.status === "ready" && !res.recomputed && !hasChart) {
        // The server says a chart exists but this render didn't see one, so no
        // refresh is coming and the overlay would hang. Force one.
        router.refresh()
      }
    }

    void run()
    // `ran` keeps this to a single pass, so the captured `hasChart` is always
    // the value from the render that mounted us — which is what the branches
    // above want.
  }, [router, hasChart])

  /**
   * Nothing to cover once the chart is here: `hasChart` flips to true on the
   * refreshed server render, which is also the exact moment the reads land — so
   * the overlay lifts precisely when the spiral is ready, with no timer to
   * guess at and no flash for returning users (who mount with hasChart already
   * true and render nothing at all).
   */
  if (hasChart) return null

  return <SkySettlingOverlay failed={failed} />
}
