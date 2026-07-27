"use server"

import { createClient } from "@/lib/supabase/server"
import { maybeUnlockNextLens } from "@/lib/self/lenses"
import type { ReadResponse } from "@/lib/self/reads-data"

type Result = { ok: true } | { ok: false; error: string }

/**
 * Save (or switch) the user's agree/disagree response for one fragment.
 * Upserts on the (profile_id, fragment_id) unique pair.
 */
export async function saveReadResponse(
  fragmentId: string,
  response: ReadResponse,
): Promise<Result> {
  if (response !== "agree" && response !== "disagree") {
    return { ok: false, error: "invalid response" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "not signed in" }

  const { error } = await supabase
    .from("read_responses")
    .upsert(
      { profile_id: user.id, fragment_id: fragmentId, response },
      { onConflict: "profile_id,fragment_id" },
    )

  if (error) return { ok: false, error: error.message }

  // Every saved response can push lens progress over the next unlock
  // threshold. Best-effort — never blocks or fails the save itself.
  await maybeUnlockNextLens(supabase, user.id)

  return { ok: true }
}

/**
 * Save the user's free-text answer to a fragment's self-questions. There's no
 * unique constraint on self_entries, so we update an existing answer row for
 * this fragment if one exists, otherwise insert a new one.
 */
export async function saveSelfAnswer(
  fragmentId: string,
  content: string,
): Promise<Result> {
  const trimmed = content.trim()
  if (!trimmed) return { ok: false, error: "empty answer" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "not signed in" }

  const { data: existing } = await supabase
    .from("self_entries")
    .select("id")
    .eq("profile_id", user.id)
    .eq("fragment_id", fragmentId)
    .eq("kind", "answer")
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from("self_entries")
      .update({ content: trimmed })
      .eq("id", existing.id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  const { error } = await supabase.from("self_entries").insert({
    profile_id: user.id,
    fragment_id: fragmentId,
    kind: "answer",
    content: trimmed,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
