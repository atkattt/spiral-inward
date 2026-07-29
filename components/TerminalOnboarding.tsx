"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * TerminalOnboarding
 * A Matrix-inspired onboarding: the system types to the user line by line,
 * then waits for minimal styled inputs. Cool, sparse, a little uncanny.
 * White/grey on black, monospace.
 *
 * Collects birth data (date, time, place) as a conversation, then calls
 * onComplete with the answers. Account/email step is intentionally NOT here —
 * decide whether it comes before this screen or after "…found you."
 *
 * Usage:
 *   <TerminalOnboarding onComplete={(data) => { ... }} />
 *   // data = { date: string, time: string, place: string, timeUnknown: boolean }
 */

type Answers = {
  date?: string;
  time?: string;
  place?: string;
  timeUnknown?: boolean;
  /** The resolved geocode pick (coords + timezone) for the chosen place. */
  placePick?: {
    label: string;
    name: string;
    admin1: string | null;
    country: string | null;
    lat: number;
    lng: number;
    timezone: string;
  };
};

type Field = {
  type: "date" | "time" | "text";
  placeholder: string;
  key: "date" | "time" | "place";
  toggle?: string;
};

type Step = {
  say: string[];
  field?: Field;
  final?: boolean;
  /** Reveal by scrambling through glyphs instead of typing, and stage the
   *  field/button in after it settles. Used for the opening line so the screen
   *  boots up rather than starting mid-sentence. */
  scramble?: boolean;
};

const STEPS: Step[] = [
  {
    say: ["when did you arrive?"],
    field: { type: "date", placeholder: "MM / DD / YYYY", key: "date" },
    scramble: true,
  },
  {
    say: ["the hour matters more than you'd think."],
    field: {
      type: "time",
      placeholder: "HH : MM",
      key: "time",
      toggle: "i don't know the time",
    },
  },
  {
    say: ["and where?"],
    field: { type: "text", placeholder: "city, country", key: "place" },
  },
  { say: ["…found you."], final: true },
];

// timing knobs
const TYPE_MS = 26; // per character
const DOT_PAUSE = 90; // extra pause after a period
const LINE_PAUSE = 420; // beat between lines
const START_DELAY = 120;

// Glyph-scramble reveal (opening line only).
// ASCII only, deliberately: the card is set in "Geist Pixel", which has no
// block/geometric glyphs (▓ ◆ ✳ ≡ …) — those rendered as tofu boxes. These all
// exist in the face and read as a terminal booting rather than as missing font.
const SCRAMBLE_GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\|?!~^:;-_";
const SCRAMBLE_FRAME_MS = 45; // glyph churn rate
const SCRAMBLE_LEAD_MS = 260; // all-glyph "loading" beat before letters land
const SCRAMBLE_SETTLE_MS = 620; // spread over which characters resolve L→R
const FIELD_REVEAL_MS = 240; // beat after the line settles, before the field
const BUTTON_REVEAL_MS = 260; // beat after the field, before the button

const randGlyph = () =>
  SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];

// auto-insert separators as digits are typed
function formatDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8); // MMDDYYYY
  let out = "";
  for (let i = 0; i < d.length; i++) {
    out += d[i];
    if (i === 1 || i === 3) out += " / ";
  }
  return out;
}
function formatTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4); // HHMM
  let out = "";
  for (let i = 0; i < d.length; i++) {
    out += d[i];
    if (i === 1) out += " : ";
  }
  return out;
}

type LogLine = { text: string; cls: "sys" | "me" };

// A geocoded place candidate offered while the visitor types their birth city.
type PlaceSuggestion = {
  label: string;
  name: string;
  admin1: string | null;
  country: string | null;
  lat: number;
  lng: number;
  timezone: string;
};

export default function TerminalOnboarding({
  onComplete,
}: {
  onComplete?: (data: Answers) => void;
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [typing, setTyping] = useState<string>(""); // currently-typing partial line
  const [showField, setShowField] = useState(false);
  // The submit button is staged in AFTER the field so the opening screen
  // assembles in order: line → date field → button.
  const [showButton, setShowButton] = useState(false);
  // Suppresses the typing caret while glyphs are churning — a blinking cursor
  // next to scrambling glyphs reads as two competing animations.
  const [scrambling, setScrambling] = useState(false);
  const [activeField, setActiveField] = useState<Field | null>(null);
  const [value, setValue] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("AM");
  const [isFinal, setIsFinal] = useState(false);
  // Birth-place typeahead: candidates fetched as the visitor types, so the
  // city is PICKED from real geocoded places instead of free-typed ("new york
  // ny" vs "new york, ny" can never diverge — both resolve to the same pick).
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [pickedPlace, setPickedPlace] = useState<PlaceSuggestion | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answers = useRef<Answers>({});
  const stepRef = useRef(0);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Monotonic token identifying the active run. Each effect invocation bumps
  // it; any in-flight async loop bails the moment it no longer matches. This
  // prevents React StrictMode's double-invoked effect from typing lines twice.
  const runIdRef = useRef(0);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wait = (ms: number) =>
    new Promise<void>((res) => setTimeout(res, ms));

  const scrollDown = () => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // type one system line, char by char
  const typeLine = useCallback(
    async (text: string, runId: number) => {
      if (runId !== runIdRef.current) return;
      if (text === "") {
        setLines((l) => [...l, { text: "", cls: "sys" }]);
        return;
      }
      if (reduceMotion) {
        setLines((l) => [...l, { text, cls: "sys" }]);
        scrollDown();
        return;
      }
      setTyping("");
      await wait(START_DELAY);
      let acc = "";
      for (let i = 0; i < text.length; i++) {
        if (runId !== runIdRef.current) return;
        acc += text[i];
        setTyping(acc);
        scrollDown();
        // eslint-disable-next-line no-await-in-loop
        await wait(TYPE_MS + (text[i] === "." ? DOT_PAUSE : 0));
      }
      // commit the finished line, clear the in-progress buffer
      setTyping("");
      setLines((l) => [...l, { text, cls: "sys" }]);
      scrollDown();
    },
    [reduceMotion]
  );

  /**
   * Reveal a line by churning every character through random glyphs, then
   * settling them left-to-right into the real text.
   *
   * Spaces are never scrambled, so the line holds its final width and word
   * shape from the first frame — the block of glyphs visibly IS the sentence
   * loading in, rather than a bar of noise that resizes as it resolves.
   */
  const scrambleLine = useCallback(
    async (text: string, runId: number) => {
      if (runId !== runIdRef.current) return;
      if (reduceMotion) {
        setLines((l) => [...l, { text, cls: "sys" }]);
        scrollDown();
        return;
      }
      const chars = [...text];
      // Each character's settle time, staggered across SCRAMBLE_SETTLE_MS.
      const settleAt = chars.map(
        (_, i) =>
          SCRAMBLE_LEAD_MS +
          (chars.length <= 1 ? 0 : (i / (chars.length - 1)) * SCRAMBLE_SETTLE_MS),
      );
      const total = SCRAMBLE_LEAD_MS + SCRAMBLE_SETTLE_MS;
      setScrambling(true);
      const start = Date.now();
      for (;;) {
        if (runId !== runIdRef.current) {
          setScrambling(false);
          return;
        }
        const elapsed = Date.now() - start;
        setTyping(
          chars
            .map((c, i) =>
              c === " " ? " " : elapsed >= settleAt[i] ? c : randGlyph(),
            )
            .join(""),
        );
        scrollDown();
        if (elapsed >= total) break;
        // eslint-disable-next-line no-await-in-loop
        await wait(SCRAMBLE_FRAME_MS);
      }
      setScrambling(false);
      setTyping("");
      setLines((l) => [...l, { text, cls: "sys" }]);
      scrollDown();
    },
    [reduceMotion],
  );

  const runStep = useCallback(
    async (runId: number) => {
      if (runId !== runIdRef.current) return;
      const s = STEPS[stepRef.current];
      if (!s) return;
      setShowField(false);
      setShowButton(false);
      setActiveField(null);
      setValue("");
      setTimeUnknown(false);
      setMeridiem("AM");

      for (const line of s.say) {
        // eslint-disable-next-line no-await-in-loop
        await (s.scramble ? scrambleLine(line, runId) : typeLine(line, runId));
        if (runId !== runIdRef.current) return;
        // eslint-disable-next-line no-await-in-loop
        await wait(LINE_PAUSE);
      }
      if (runId !== runIdRef.current) return;

      if (s.final) {
        setIsFinal(true);
        return;
      }
      if (s.field) {
        if (s.scramble) {
          // Assemble in order: the settled line, then the field, then the
          // button. Focus is deferred to the button beat so the mobile keyboard
          // doesn't slide up over the screen mid-reveal.
          await wait(FIELD_REVEAL_MS);
          if (runId !== runIdRef.current) return;
          setActiveField(s.field);
          setShowField(true);
          await wait(BUTTON_REVEAL_MS);
          if (runId !== runIdRef.current) return;
          setShowButton(true);
          setTimeout(() => inputRef.current?.focus(), 80);
          return;
        }
        setActiveField(s.field);
        setShowField(true);
        setShowButton(true);
        setTimeout(() => inputRef.current?.focus(), 80);
        return;
      }
      // Interstitial step (no field, not final): auto-advance to the next step
      // after a short beat so the intro flows into the first question.
      await wait(LINE_PAUSE);
      if (runId !== runIdRef.current) return;
      stepRef.current += 1;
      runStep(runId);
    },
    [typeLine, scrambleLine]
  );

  useEffect(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    stepRef.current = 0;
    setLines([]);
    setTyping("");
    runStep(runId);
    return () => {
      // Invalidate this run so any in-flight async loop stops immediately.
      runIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced typeahead fetch for the birth-place field.
  const fetchSuggestions = useCallback((query: string) => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setPlaceSuggestions([]);
      setHighlightIdx(-1);
      return;
    }
    suggestTimerRef.current = setTimeout(async () => {
      suggestAbortRef.current?.abort();
      const ctrl = new AbortController();
      suggestAbortRef.current = ctrl;
      try {
        const res = await fetch(
          `/api/geocode?suggest=1&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: PlaceSuggestion[] };
        if (ctrl.signal.aborted) return;
        setPlaceSuggestions(data.suggestions ?? []);
        setHighlightIdx(data.suggestions?.length ? 0 : -1);
      } catch {
        // aborted or offline — keep whatever list is showing
      }
    }, 250);
  }, []);

  const pickPlace = (s: PlaceSuggestion) => {
    setPickedPlace(s);
    setValue(s.label);
    setPlaceSuggestions([]);
    setHighlightIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const submit = async () => {
    const f = activeField;
    if (!f) return;
    // The birth place must be a REAL picked suggestion, not free text. If the
    // visitor typed but never picked, auto-adopt the highlighted candidate;
    // with no candidates at all, hold until the list resolves.
    if (f.key === "place" && !pickedPlace) {
      const auto =
        placeSuggestions[highlightIdx >= 0 ? highlightIdx : 0];
      if (auto) {
        pickPlace(auto);
        answers.current.place = auto.label;
        answers.current.placePick = auto;
        setShowField(false);
        setShowButton(false);
        setActiveField(null);
        setLines((l) => [...l, { text: auto.label, cls: "me" }]);
        setValue("");
        await wait(300);
        stepRef.current += 1;
        runStep(runIdRef.current);
      }
      return;
    }
    const base = value.trim();
    // For the time field, append the chosen AM/PM marker to the value.
    const composed =
      f.type === "time" && base ? `${base} ${meridiem}` : base;
    const val = timeUnknown ? "(time unknown)" : composed;
    if (!val) return;

    answers.current[f.key] = timeUnknown ? "" : val;
    if (f.key === "time") answers.current.timeUnknown = timeUnknown;
    if (f.key === "place" && pickedPlace) {
      // Ship the fully-resolved pick (coords + timezone + canonical label) so
      // downstream steps never re-parse free text.
      answers.current.place = pickedPlace.label;
      answers.current.placePick = pickedPlace;
    }

    // echo the user's answer back, brighter
    setShowField(false);
    setShowButton(false);
    setActiveField(null);
    setLines((l) => [...l, { text: val, cls: "me" }]);
    setValue("");
    await wait(300);
    stepRef.current += 1;
    runStep(runIdRef.current);
  };

  const finish = () => {
    onComplete?.(answers.current);
  };

  return (
    <div
      style={{
        position: "relative",
        zIndex: 10,
        color: "#fff",
        // Match the BEGIN button: Geist family at semibold weight. Set here on
        // the root container so every child (log lines, inputs, buttons, which
        // all use fontFamily "inherit") picks up the same typeface.
        fontFamily: '"Geist Pixel", sans-serif',
        fontWeight: 600,
        width: "100%",
        maxWidth: 440,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          // Translucent frosted-grey glass rectangle with curved corners that
          // floats over the animated sky. The blur + subtle border + shadow
          // give it a glassmorphism feel while the grey tint keeps the text
          // readable against the moving background behind it.
          width: "100%",
          // Subtract the page's vertical padding (main uses py-6 = 48px total)
          // so the card fits fully inside the viewport and the flex parent can
          // center it vertically instead of overflowing / pinning to the top.
          height: "min(100dvh - 96px, 760px)",
          background: "rgba(120, 120, 120, 0.38)",
          backdropFilter: "blur(16px) saturate(120%)",
          WebkitBackdropFilter: "blur(16px) saturate(120%)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          borderRadius: 28,
          boxShadow:
            "0 24px 60px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
          padding: "calc(env(safe-area-inset-top, 0px) + 28px) 28px calc(env(safe-area-inset-bottom, 0px) + 28px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          ref={logRef}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflowY: "auto",
            paddingTop: "clamp(12px, 3vh, 32px)",
          }}
        >
          {lines.map((l, i) => (
            <div
              key={i}
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                letterSpacing: ".3px",
                whiteSpace: "pre-wrap",
                textWrap: "pretty",
                color: l.cls === "me" ? "#fff" : "#f0f0f0",
                fontFamily: '"Geist Pixel", sans-serif',
                fontWeight: 500,
              }}
            >
              {l.cls === "me" && (
                <span style={{ color: "#cfcfcf" }}>{"› "}</span>
              )}
              {l.text === "" ? "\u00A0" : l.text}
            </div>
          ))}

          {/* the line currently being typed */}
          {typing !== "" && (
            <div
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                letterSpacing: ".3px",
                whiteSpace: "pre-wrap",
                textWrap: "pretty",
                color: "#f0f0f0",
                fontFamily: '"Geist Pixel", sans-serif',
                fontWeight: 500,
              }}
            >
              {typing}
              {!scrambling && (
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 19,
                    background: "#fff",
                    marginLeft: 2,
                    verticalAlign: -3,
                    animation: "siBlink 1.05s steps(1) infinite",
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* answer zone */}
        {showField && activeField && (
          <div
            style={{ marginTop: 6, animation: "siRise .34s ease-out both" }}
          >
            {(() => {
              const isMasked =
                activeField.type === "date" || activeField.type === "time";
              const mask = activeField.placeholder; // "MM / DD / YYYY" or "HH : MM"
              const nbsp = (s: string) => s.replace(/ /g, "\u00A0");
              const typed = value; // already formatted on change
              const remaining = mask.slice(typed.length);
              return (
                <div
                  style={{
                    position: "relative",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.55)",
                    padding: "9px 2px",
                  }}
                >
                  {/* ghost watermark: typed part transparent, remaining grey */}
                  {isMasked && !timeUnknown && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: 2,
                        top: 9,
                        fontSize: 16,
                        letterSpacing: 1,
                        color: "rgba(255, 255, 255, 0.5)",
                        pointerEvents: "none",
                        whiteSpace: "pre",
                      }}
                    >
                      <span style={{ color: "transparent" }}>{nbsp(typed)}</span>
                      {nbsp(remaining)}
                    </div>
                  )}
                  {/* plain placeholder for free-text fields */}
                  <input
                    ref={inputRef}
                    value={value}
                    disabled={timeUnknown}
                    inputMode={isMasked ? "numeric" : "text"}
                    placeholder={isMasked ? "" : activeField.placeholder}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (activeField.type === "date") setValue(formatDate(v));
                      else if (activeField.type === "time")
                        setValue(formatTime(v));
                      else {
                        setValue(v);
                        if (activeField.key === "place") {
                          // Typing again invalidates any earlier pick.
                          setPickedPlace(null);
                          fetchSuggestions(v);
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (activeField.key === "place" && placeSuggestions.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setHighlightIdx((i) => (i + 1) % placeSuggestions.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setHighlightIdx(
                            (i) => (i - 1 + placeSuggestions.length) % placeSuggestions.length,
                          );
                          return;
                        }
                      }
                      if (e.key === "Enter") {
                        // CJK IME safety: don't submit mid-composition.
                        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                        submit();
                      }
                    }}
                    style={{
                      position: "relative",
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      fontFamily: '"Geist Pixel", sans-serif',
                      fontWeight: 500,
                      fontSize: 16,
                      letterSpacing: 1,
                      padding: 0,
                      outline: "none",
                      caretColor: "#fff",
                    }}
                  />
                </div>
              );
            })()}
            {/* Birth-place typeahead: real geocoded places appear as the
                visitor types; picking one locks in canonical coords, so
                "new york ny" vs "new york, ny" can never diverge. */}
            {activeField.key === "place" && placeSuggestions.length > 0 && !pickedPlace && (
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
                        i === highlightIdx ? "rgba(255,255,255,0.92)" : "transparent",
                      color: i === highlightIdx ? "#000" : "#f0f0f0",
                      border: "none",
                      fontFamily: "inherit",
                      fontWeight: 500,
                      fontSize: 13,
                      letterSpacing: ".4px",
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {activeField.key === "place" && pickedPlace && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "#e0e0e0",
                }}
              >
                {"● " + pickedPlace.label}
              </div>
            )}
            {activeField.type === "time" && !timeUnknown && (
              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                {(["AM", "PM"] as const).map((m) => {
                  const selected = meridiem === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMeridiem(m);
                        setTimeout(() => inputRef.current?.focus(), 30);
                      }}
                      style={{
                        background: selected ? "#fff" : "transparent",
                        border: `1px solid ${selected ? "#fff" : "rgba(255,255,255,0.5)"}`,
                        color: selected ? "#000" : "#f0f0f0",
                        fontFamily: "inherit",
                        fontSize: 11,
                        letterSpacing: 2,
                        padding: "8px 16px",
                        borderRadius: 30,
                        cursor: "pointer",
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            )}
            {activeField.toggle && (
              <div
                onClick={() => {
                  const next = !timeUnknown;
                  setTimeUnknown(next);
                  if (!next) setTimeout(() => inputRef.current?.focus(), 30);
                }}
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "#e0e0e0",
                  cursor: "pointer",
                }}
              >
                {(timeUnknown ? "● " : "○ ") + activeField.toggle}
              </div>
            )}
            {showButton && (
              <button
                onClick={submit}
                style={{
                  marginTop: 14,
                  background: "transparent",
                  border: "1px solid #fff",
                  color: "#fff",
                  fontFamily: '"Geist Pixel", sans-serif',
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  padding: "11px 20px",
                  borderRadius: 30,
                  cursor: "pointer",
                  animation: "siRise .34s ease-out both",
                }}
              >
                enter ⏎
              </button>
            )}
          </div>
        )}

        {/* final */}
        {isFinal && (
          <button
            onClick={finish}
            style={{
              marginTop: 14,
              alignSelf: "flex-start",
              background: "transparent",
              border: "1px solid #fff",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              padding: "12px 22px",
              borderRadius: 30,
              cursor: "pointer",
            }}
          >
            enter the spiral ⏎
          </button>
        )}
      </div>

      <style>{`
        @keyframes siBlink { 50% { opacity: 0; } }
        @keyframes siRise {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes siRise { from { opacity: 1; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
