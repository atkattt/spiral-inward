"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useCircleData } from "@/components/circle/circle-data-provider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/terminal-toast"
import { GLASS_DIALOG_WIDTH, glassPanelStyle, ledOverlayStyle } from "@/lib/ui/glass"

// The onboarding terminal's visual language, mirrored here so adding a
// person feels like the same ritual as entering your own details:
// Geist Pixel, transparent underline inputs, pill outline buttons,
// ●/○ text toggles — no boxed form chrome.
const PIXEL = '"Geist Pixel", sans-serif'

const labelStyle: React.CSSProperties = {
  fontFamily: PIXEL,
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.6)",
}

const fieldWrapStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(255, 255, 255, 0.55)",
  padding: "6px 2px",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  color: "#fff",
  fontFamily: PIXEL,
  fontWeight: 500,
  fontSize: 16,
  letterSpacing: 1,
  padding: 0,
  outline: "none",
  caretColor: "#fff",
  // Native date/time pickers render dark to match.
  colorScheme: "dark",
}

// Same masked "HH : MM" formatter the onboarding terminal uses.
function formatTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4) // HHMM
  let out = ""
  for (let i = 0; i < d.length; i++) {
    out += d[i]
    if (i === 1) out += " : "
  }
  return out
}

// A geocoded place candidate offered while typing the birth city
// (mirrors the onboarding typeahead: /api/geocode?suggest=1).
type PlaceSuggestion = {
  label: string
  name: string
  admin1: string | null
  country: string | null
  lat: number
  lng: number
  timezone: string
}

export function AddPersonDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [birthTime, setBirthTime] = useState("")
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("AM")
  const [timeUnknown, setTimeUnknown] = useState(false)
  const [birthPlace, setBirthPlace] = useState("")
  // Place typeahead — picking a real geocoded place keeps entries canonical
  // ("New York, New York, United States"), same as onboarding.
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([])
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [pickedPlace, setPickedPlace] = useState<PlaceSuggestion | null>(null)
  const suggestAbortRef = useRef<AbortController | null>(null)
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPending, startTransition] = useTransition()
  const { addPerson } = useCircleData()

  function reset() {
    setName("")
    setBirthDate("")
    setBirthTime("")
    setMeridiem("AM")
    setTimeUnknown(false)
    setBirthPlace("")
    setPlaceSuggestions([])
    setHighlightIdx(-1)
    setPickedPlace(null)
  }

  // Debounced typeahead fetch, identical behavior to onboarding.
  const fetchSuggestions = useCallback((query: string) => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setPlaceSuggestions([])
      setHighlightIdx(-1)
      return
    }
    suggestTimerRef.current = setTimeout(async () => {
      suggestAbortRef.current?.abort()
      const ctrl = new AbortController()
      suggestAbortRef.current = ctrl
      try {
        const res = await fetch(
          `/api/geocode?suggest=1&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        )
        if (!res.ok) return
        const data = (await res.json()) as { suggestions?: PlaceSuggestion[] }
        if (ctrl.signal.aborted) return
        setPlaceSuggestions(data.suggestions ?? [])
        setHighlightIdx(data.suggestions?.length ? 0 : -1)
      } catch {
        // aborted or offline — keep whatever list is showing
      }
    }, 250)
  }, [])

  function pickPlace(s: PlaceSuggestion) {
    setPickedPlace(s)
    setBirthPlace(s.label)
    setPlaceSuggestions([])
    setHighlightIdx(-1)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    // If they typed but never picked, adopt the highlighted candidate so the
    // stored place is always canonical when suggestions were available.
    const place = pickedPlace
      ? pickedPlace.label
      : (placeSuggestions[highlightIdx >= 0 ? highlightIdx : 0]?.label ??
        birthPlace)

    const composedTime = birthTime.trim()
      ? `${birthTime.trim()} ${meridiem}`
      : ""

    startTransition(async () => {
      try {
        await addPerson({
          name,
          birthDate: birthDate || null,
          birthTime: timeUnknown ? null : composedTime || null,
          birthTimeUnknown: timeUnknown,
          birthPlace: place || null,
        })
        toast(`${name.trim()} has joined your sky`)
        reset()
        onOpenChange(false)
      } catch {
        toast("Could not add this person. Please try again.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${GLASS_DIALOG_WIDTH} gap-3 p-4 ring-0`}
        style={glassPanelStyle}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle
            style={{
              fontFamily: PIXEL,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: 1,
              color: "#fff",
            }}
          >
            add a person
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <label htmlFor="p-name" style={labelStyle}>
              name
            </label>
            <div style={fieldWrapStyle}>
              <input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="who is this?"
                autoFocus
                required
                style={inputStyle}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="p-date" style={labelStyle}>
              birth date
            </label>
            <div style={fieldWrapStyle}>
              <input
                id="p-date"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="p-time" style={labelStyle}>
              birth time
            </label>
            {!timeUnknown && (
              <>
                <div style={fieldWrapStyle}>
                  <input
                    id="p-time"
                    inputMode="numeric"
                    value={birthTime}
                    onChange={(e) => setBirthTime(formatTime(e.target.value))}
                    placeholder="08 : 30"
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                  {(["AM", "PM"] as const).map((m) => {
                    const selected = meridiem === m
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMeridiem(m)}
                        style={{
                          background: selected ? "#fff" : "transparent",
                          border: `1px solid ${selected ? "#fff" : "rgba(255,255,255,0.5)"}`,
                          color: selected ? "#000" : "#f0f0f0",
                          fontFamily: PIXEL,
                          fontSize: 11,
                          letterSpacing: 2,
                          padding: "8px 16px",
                          borderRadius: 30,
                          cursor: "pointer",
                        }}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setTimeUnknown((u) => !u)}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: PIXEL,
                fontSize: 11,
                letterSpacing: 1,
                color: "#e0e0e0",
                cursor: "pointer",
              }}
            >
              {(timeUnknown ? "● " : "○ ") + "i don't know the time"}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="p-place" style={labelStyle}>
              birth place
            </label>
            <div style={fieldWrapStyle}>
              <input
                id="p-place"
                value={birthPlace}
                onChange={(e) => {
                  setBirthPlace(e.target.value)
                  // Typing again invalidates any earlier pick.
                  setPickedPlace(null)
                  fetchSuggestions(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (placeSuggestions.length === 0) return
                  if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setHighlightIdx((i) => (i + 1) % placeSuggestions.length)
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setHighlightIdx(
                      (i) =>
                        (i - 1 + placeSuggestions.length) %
                        placeSuggestions.length,
                    )
                  } else if (e.key === "Enter") {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    e.preventDefault()
                    const s =
                      placeSuggestions[highlightIdx >= 0 ? highlightIdx : 0]
                    if (s) pickPlace(s)
                  }
                }}
                placeholder="city"
                autoComplete="off"
                style={inputStyle}
              />
            </div>
            {placeSuggestions.length > 0 && !pickedPlace && (
              <div
                role="listbox"
                aria-label="place suggestions"
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(0,0,0,0.35)",
                }}
              >
                {placeSuggestions.map((s, i) => (
                  <button
                    key={`${s.lat},${s.lng}`}
                    type="button"
                    role="option"
                    aria-selected={i === highlightIdx}
                    onMouseEnter={() => setHighlightIdx(i)}
                    onClick={() => pickPlace(s)}
                    style={{
                      textAlign: "left",
                      background:
                        i === highlightIdx
                          ? "rgba(255,255,255,0.92)"
                          : "transparent",
                      color: i === highlightIdx ? "#000" : "#f0f0f0",
                      border: "none",
                      fontFamily: PIXEL,
                      fontWeight: 500,
                      fontSize: 13,
                      letterSpacing: 0.4,
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {pickedPlace && (
              <div
                style={{
                  marginTop: 8,
                  fontFamily: PIXEL,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "#e0e0e0",
                }}
              >
                {"● " + pickedPlace.label}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending || !name.trim()}
            style={{
              marginTop: 6,
              background: "transparent",
              border: "1px solid #fff",
              color: "#fff",
              fontFamily: PIXEL,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              padding: "11px 20px",
              borderRadius: 30,
              cursor: "pointer",
              opacity: isPending || !name.trim() ? 0.4 : 1,
            }}
          >
            {isPending ? "placing star…" : "add to circle ⏎"}
          </button>
        </form>

        {/* LED screen overlay, the same treatment the /self avatar, the landing
            creature, the onboarding card, the story cards and the threshold
            disc wear.

            gridAlpha 0.10 and the tightened vignette match the other panels
            that carry real copy: this one holds 11px pixel labels and live
            inputs, which the avatar's denser 0.16 grid visibly fringes.

            Two things this relies on:
            - DialogContent is already `fixed`, so it anchors this absolute
              child without needing position: relative added.
            - It has no overflow-hidden, so the radius must be set explicitly to
              glassPanelStyle's 13 or the grid would square off the corners.

            pointerEvents: none (from the helper) is load-bearing here rather
            than cosmetic — this panel is a whole form, so the overlay sits over
            every input and the AM/PM pills. Verified typable through it.

            Note this is the last child written here but not the last DOM child:
            the primitive appends its own close X after children, so that button
            paints above the grid. Left as is, since it keeps the X crisp. */}
        <div aria-hidden="true" style={ledOverlayStyle({ radius: 13, gridAlpha: 0.1, vignetteBlur: 28, vignetteSpread: 6, vignetteAlpha: 0.34 })} />
      </DialogContent>
    </Dialog>
  )
}
