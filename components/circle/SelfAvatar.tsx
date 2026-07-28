"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * SelfAvatar
 * An expressive ASCII "you" for the center of the spiral. A true-circle face
 * built from glyphs that breathes, blinks, and emotes. Reactive now, fully
 * driven by props so it can be wired to real app state later.
 *
 * Props:
 *   mood    — current expression (see Mood type). Transient moods (agree/
 *             disagree/submit) auto-decay back to "idle" after ~0.7s; persistent
 *             moods (content/sleepy/curious/overwhelmed/idle) hold until changed.
 *   growth  — 0..1, how "full"/defined the self is (sparse → dense).
 *   size    — pixel size of the avatar box (default 80). Scales font to fit.
 *
 * Usage at the spiral center (replacing the static YOU dot):
 *   <SelfAvatar mood={mood} growth={0.4} size={76} />
 *
 * Wiring later: on agree → setMood("agree"); on disagree → setMood("disagree");
 * on submitting a truth → setMood("submit"); set growth from how much the user
 * has explored (reads judged / truths added / people added — your choice).
 */

export type Mood =
  | "idle"
  | "agree"
  | "disagree"
  | "submit"
  | "curious"
  | "content"
  | "overwhelmed"
  | "sleepy";

type Expr = {
  eye: "open" | "wide" | "squint" | "closed" | "spiral" | "up";
  mouth: "smile" | "frown" | "flat" | "open" | "small" | "wave" | "cat";
  glow: string; // rgba inner
  jitter: number;
  bloom: number;
  breathe: number;
  tilt?: number;
};

const EXPR: Record<Mood, Expr> = {
  idle: { eye: "open", mouth: "small", glow: "212,169,96,.18", jitter: 0, bloom: 0, breathe: 1 },
  agree: { eye: "up", mouth: "smile", glow: "143,201,163,.45", jitter: 0, bloom: 0, breathe: 1.2 },
  disagree: { eye: "squint", mouth: "frown", glow: "217,138,154,.4", jitter: 1.3, bloom: 0, breathe: 1 },
  submit: { eye: "wide", mouth: "open", glow: "127,196,212,.45", jitter: 0, bloom: 1, breathe: 1 },
  curious: { eye: "wide", mouth: "small", glow: "169,154,217,.4", jitter: 0, bloom: 0, breathe: 1, tilt: 1 },
  content: { eye: "closed", mouth: "cat", glow: "143,201,163,.3", jitter: 0, bloom: 0, breathe: 0.8 },
  overwhelmed: { eye: "spiral", mouth: "wave", glow: "217,138,154,.45", jitter: 0.8, bloom: 0, breathe: 1.4 },
  sleepy: { eye: "closed", mouth: "flat", glow: "124,135,163,.25", jitter: 0, bloom: 0, breathe: 0.5 },
};

const RX = 11;
const RY = 7;
const ASPECT = RY / RX;
const RAMP = [" ", "·", "·", ":", "+", "*", "#", "✦"];
const TRANSIENT: Mood[] = ["agree", "disagree", "submit"];

export default function SelfAvatar({
  mood = "idle",
  growth = 0.4,
  size = 80,
  color = null,
}: {
  mood?: Mood;
  growth?: number;
  size?: number;
  /**
   * Optional tint that overrides the glyph color AND the glow/drop-shadow.
   * When null/undefined the avatar keeps its mood-based gold glow (default for
   * existing usages). The spiral universe passes a value here — neutral white
   * (#e8e4da) at rest, or a person's color / green / rose during reactions.
   */
  color?: string | null;
}) {
  const ref = useRef<HTMLPreElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // live values the loop reads (avoid re-subscribing the rAF on every prop change)
  const moodRef = useRef<Mood>(mood);
  const growthRef = useRef<number>(growth);
  const colorRef = useRef<string | null>(color);
  const reactT = useRef<number>(0);

  // Hydration-safe: SSR always sees `false`, then the real value lands after
  // mount. Only consumed inside the rAF effect below, never in SSR'd markup.
  const reduceMotion = useReducedMotion();

  // when mood prop changes, trigger it (transient moods get a decay timer).
  // ~84 frames ≈ 1.4s so the agree/disagree expression is clearly readable
  // before it eases back to idle.
  useEffect(() => {
    moodRef.current = mood;
    reactT.current = TRANSIENT.includes(mood) ? 84 : 9999;
  }, [mood]);

  useEffect(() => {
    growthRef.current = growth;
  }, [growth]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let blink = 0;
    let nextBlink = 140;

    const field = (t: number) => {
      const e = EXPR[moodRef.current] || EXPR.idle;
      const g = growthRef.current;
      const breathe = Math.sin(t * 0.06 * e.breathe) * 0.5 + 0.5;
      const react = reactT.current > 0 ? reactT.current / 84 : 0;
      const isBlink = blink > 0 && e.eye !== "closed";
      const bodyR = RX - 1.3 + breathe * 0.7;
      const tilt = e.tilt ? Math.sin(t * 0.05) * 1.2 : 0;
      const grid: number[][] = [];

      for (let y = -RY; y <= RY; y++) {
        const row: number[] = [];
        for (let x = -RX; x <= RX; x++) {
          const nx = x;
          const ny = y / ASPECT;
          const d = Math.sqrt(nx * nx + ny * ny);
          let v = 0;

          const shell = Math.max(0, 1 - Math.abs(d - bodyR) / 2.0);
          v = shell * (0.4 + g * 0.6);
          if (d < bodyR - 1) v = Math.max(v, g * 0.5 * (1 - d / RX));
          if (e.bloom > 0 && react > 0) {
            const br = Math.max(0, 1 - Math.abs(d - bodyR * react) / 1.1);
            v = Math.max(v, br * 0.9);
          }

          const fx = x + tilt;
          const eyeX = 4;
          const eyeY = -2;
          [-eyeX, eyeX].forEach((ex) => {
            const dx = Math.abs(fx - ex);
            const dy = y - eyeY;
            if (e.eye === "closed" || isBlink) {
              if (Math.abs(dy) < 0.6 && dx < 1.4) v = 0.9;
            } else if (e.eye === "wide") {
              if (Math.abs(dy) < 1.0 && dx < 1.0) v = 1;
            } else if (e.eye === "squint") {
              if (Math.abs(dy) < 0.45 && dx < 1.2) v = 1;
            } else if (e.eye === "up") {
              if (Math.abs(dy + 0.4) < 0.7 && dx < 0.8) v = 1;
            } else if (e.eye === "spiral") {
              const a = Math.atan2(dy, fx - ex);
              const rr = Math.sqrt(dx * dx + dy * dy);
              if (rr < 1.6 && Math.abs((a + rr * 2 + t * 0.1) % (Math.PI / 1.5)) < 0.5) v = 1;
            } else {
              if (Math.abs(dy) < 0.7 && dx < 0.7) v = 1;
            }
          });

          if (moodRef.current === "overwhelmed" && Math.abs(y - (eyeY - 2)) < 0.5) {
            if (Math.abs(Math.abs(fx) - eyeX) < 1.4) v = Math.max(v, 0.7);
          }

          const mY = 3;
          const adx = Math.abs(fx);
          let mouthHit = false;
          if (e.mouth === "smile") {
            const c = mY - 1.1 * (1 - Math.min(1, adx / 3)) * (fx * fx) / 9;
            if (Math.abs(y - c) < 0.55 && adx < 3.2) mouthHit = true;
          } else if (e.mouth === "frown") {
            const c = mY + 1.0 * (1 - Math.min(1, adx / 3)) * (fx * fx) / 9 - 1;
            if (Math.abs(y - c) < 0.55 && adx < 3.0) mouthHit = true;
          } else if (e.mouth === "flat") {
            if (Math.abs(y - mY) < 0.5 && adx < 2.4) mouthHit = true;
          } else if (e.mouth === "small") {
            if (Math.abs(y - mY) < 0.5 && adx < 1.2) mouthHit = true;
          } else if (e.mouth === "open") {
            const rr = Math.sqrt(fx * fx + ((y - mY) / ASPECT) * ((y - mY) / ASPECT));
            if (Math.abs(rr - 1.6) < 0.6) mouthHit = true;
          } else if (e.mouth === "wave") {
            const c = mY + Math.sin(fx * 1.6 + t * 0.2) * 0.7;
            if (Math.abs(y - c) < 0.5 && adx < 3) mouthHit = true;
          } else if (e.mouth === "cat") {
            const c = mY - 0.8 * (1 - Math.min(1, adx / 2.2));
            if (Math.abs(y - c) < 0.5 && adx < 2.2 && adx > 0.4) mouthHit = true;
            if (adx < 0.5 && Math.abs(y - mY) < 0.5) mouthHit = true;
          }
          if (mouthHit) v = Math.max(v, 0.95);

          if (e.jitter > 0 && react > 0 && Math.random() < e.jitter * react * 0.05) {
            v = Math.min(1, v + 0.5);
          }

          row.push(d <= RX + 0.5 ? v : 0);
        }
        grid.push(row);
      }
      return grid;
    };

    const draw = () => {
      const grid = field(frame);
      let out = "";
      for (const row of grid) {
        for (const v of row)
          out += v <= 0.02 ? " " : RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
        out += "\n";
      }
      el.textContent = out;
      const e = EXPR[moodRef.current] || EXPR.idle;
      const tint = colorRef.current;
      if (tint != null) {
        // Tinted mode: glyph + glow follow the color. White (#e8e4da) reads as
        // the neutral glowing self; person colors / green / rose are reactions.
        el.style.color = tint;
        el.style.filter = `drop-shadow(0 0 12px ${tint})`;
      } else {
        // Untinted (default): keep the mood-based gold glow used elsewhere.
        el.style.color = "#e8e4da";
        el.style.filter = `drop-shadow(0 0 9px rgba(${e.glow}))`;
      }
    };

    const loop = () => {
      frame++;
      if (blink > 0) blink--;
      else if (--nextBlink <= 0) {
        blink = 4;
        nextBlink = 90 + Math.random() * 180;
      }
      if (reactT.current > 0) reactT.current--;
      else if (TRANSIENT.includes(moodRef.current)) moodRef.current = "idle";
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    if (reduceMotion) {
      draw(); // single static frame
    } else {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [reduceMotion]);

  // font size chosen so the (2*RX+1) wide grid fits the requested pixel size
  const cols = RX * 2 + 1;
  const fontPx = (size / cols) * 1.05;

  return (
    <pre
      ref={ref}
      aria-hidden="true"
      style={{
        margin: 0,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Geist Pixel', ui-monospace, monospace",
        fontSize: `${fontPx}px`,
        lineHeight: 0.92,
        letterSpacing: 0,
        color: "#e8e4da",
        whiteSpace: "pre",
        userSelect: "none",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    />
  );
}
