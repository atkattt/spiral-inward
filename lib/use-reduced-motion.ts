"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void): () => void {
  const mq = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : null
  if (!mq) return () => {}
  // Safari <14 only supports the legacy addListener API.
  if (mq.addEventListener) {
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }
  mq.addListener(onChange)
  return () => mq.removeListener(onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia?.(QUERY).matches ?? false
}

/**
 * `prefers-reduced-motion`, read in a hydration-safe way.
 *
 * Reading `window.matchMedia` during render is a server/client branch: the
 * server has no `window` so it always renders the "false" (animated) tree,
 * while a client with reduced motion enabled renders the "true" tree, and
 * React reports a hydration mismatch on first paint.
 *
 * `useSyncExternalStore` is the correct primitive here rather than
 * `useState` + `useEffect`:
 *   - the server snapshot is passed separately, so SSR is always `false`
 *     (matching client hydration) with no mismatch, and
 *   - React re-reads the snapshot immediately after mount and subscribes to
 *     changes, so users who toggle the OS setting mid-session are respected
 *     without a manual listener in every component.
 *
 * NOTE: `false` on the server is not a guess, it is the only safe SSR value —
 * the media query is unknowable until a real client exists. Consumers must
 * therefore treat this as "animate until told otherwise" and gate their
 * animation inside an effect (which runs after the corrected value lands),
 * never in the SSR'd markup itself.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
