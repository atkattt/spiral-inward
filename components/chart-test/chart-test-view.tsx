"use client"

import { useState } from "react"

// A small, sensible set of IANA timezones for the test form.
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
]

type PlanetRow = {
  planet: string
  sign: string
  house: number
  degree: number
  nakshatra: string
  longitude: number
}

type ChartResponse = {
  meta?: Record<string, unknown>
  moon_nakshatra?: string
  moon_pada?: number
  planets: PlanetRow[]
  ascendant: {
    sign: string
    degree: number
    nakshatra: string
    longitude: number
  }
  houses: Record<string, { sign: string; planets: string[] }>
  dashas: {
    timeline: { lord: string; start: string; end: string }[]
    current: {
      lord: string
      start: string
      end: string
      antardashas: { lord: string; start: string; end: string }[]
      currentAntardasha: { lord: string; start: string; end: string } | null
    }
  }
}

export function ChartTestView() {
  const [date, setDate] = useState("1990-01-01")
  const [time, setTime] = useState("12:00")
  const [lat, setLat] = useState("40.7128")
  const [lng, setLng] = useState("-74.0060")
  const [timezone, setTimezone] = useState("America/New_York")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ChartResponse | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time,
          lat: Number(lat),
          lng: Number(lng),
          timezone,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? `request failed (${res.status})`)
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-neutral-950 px-6 py-20 text-neutral-200 lowercase">
      <div className="mx-auto flex max-w-2xl flex-col gap-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-sm tracking-widest text-neutral-500">
            chart test
          </h1>
          <p className="text-xs text-neutral-600">
            vedic / sidereal · lahiri ayanamsa · whole-sign houses
          </p>
        </header>

        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="latitude">
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="40.7128"
                className={inputClass}
                required
              />
            </Field>
            <Field label="longitude">
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-74.0060"
                className={inputClass}
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="timezone">
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={inputClass}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} className="bg-neutral-900">
                      {tz.toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-fit rounded-md border border-neutral-700 px-6 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "calculating…" : "calculate chart"}
          </button>
        </form>

        {error && (
          <pre className="whitespace-pre-wrap rounded-md border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">
            {error}
          </pre>
        )}

        {result && (
          <div className="flex flex-col gap-16">
            {/* summary: ascendant + planets */}
            <section className="flex flex-col gap-5">
              <h2 className="text-xs tracking-widest text-neutral-500">
                summary
              </h2>

              <p className="text-sm text-neutral-400">
                ascendant · {result.ascendant.sign}{" "}
                {result.ascendant.degree.toFixed(2)}° ·{" "}
                {result.ascendant.nakshatra}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-neutral-600">
                      <th className="border-b border-neutral-800 py-2 pr-4 font-normal">
                        planet
                      </th>
                      <th className="border-b border-neutral-800 py-2 pr-4 font-normal">
                        sign
                      </th>
                      <th className="border-b border-neutral-800 py-2 pr-4 font-normal">
                        deg
                      </th>
                      <th className="border-b border-neutral-800 py-2 pr-4 font-normal">
                        house
                      </th>
                      <th className="border-b border-neutral-800 py-2 font-normal">
                        nakshatra
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.planets.map((p) => (
                      <tr key={p.planet} className="text-neutral-300">
                        <td className="border-b border-neutral-900 py-2 pr-4">
                          {p.planet}
                        </td>
                        <td className="border-b border-neutral-900 py-2 pr-4 text-neutral-400">
                          {p.sign}
                        </td>
                        <td className="border-b border-neutral-900 py-2 pr-4 text-neutral-500">
                          {p.degree.toFixed(2)}°
                        </td>
                        <td className="border-b border-neutral-900 py-2 pr-4 text-neutral-500">
                          {p.house}
                        </td>
                        <td className="border-b border-neutral-900 py-2 text-neutral-400">
                          {p.nakshatra}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* moon nakshatra sanity check */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs tracking-widest text-neutral-500">
                moon nakshatra
              </h2>
              {(() => {
                const moon = result.planets.find((p) => p.planet === "moon")
                return (
                  <p className="text-sm text-neutral-400">
                    longitude · {moon ? `${moon.longitude.toFixed(4)}°` : "—"}
                    {" · "}
                    nakshatra · {result.moon_nakshatra ?? "—"}
                    {" · "}
                    pada · {result.moon_pada ?? "—"}
                  </p>
                )
              })()}
            </section>

            {/* current dasha */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs tracking-widest text-neutral-500">
                current mahadasha
              </h2>
              <p className="text-sm text-neutral-400">
                {result.dashas.current.lord} · {result.dashas.current.start} →{" "}
                {result.dashas.current.end}
              </p>
              {result.dashas.current.currentAntardasha && (
                <p className="text-sm text-neutral-500">
                  antardasha · {result.dashas.current.currentAntardasha.lord} ·{" "}
                  {result.dashas.current.currentAntardasha.start} →{" "}
                  {result.dashas.current.currentAntardasha.end}
                </p>
              )}
            </section>

            {/* raw json */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs tracking-widest text-neutral-500">
                raw json
              </h2>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-neutral-800 bg-neutral-900/40 p-4 text-xs leading-relaxed text-neutral-400">
                {JSON.stringify(result, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

const inputClass =
  "w-full rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs text-neutral-600">{label}</span>
      {children}
    </label>
  )
}
