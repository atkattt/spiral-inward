import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Brain · Spiral Inward",
  description: "Internal fragment inspector.",
}

type Fragment = {
  id: string | number
  title: string | null
  body: string | null
  archetype: string | null
  tone: string | null
  life_domain: string | null
  self_questions: string[] | string | null
  weight: number | null
}

function toQuestions(value: Fragment["self_questions"]): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (typeof value === "string" && value.trim().length > 0) {
    // Tolerate a JSON-encoded array or a plain string.
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String)
    } catch {
      return [value]
    }
    return [value]
  }
  return []
}

export default async function BrainPage() {
  // Owner only: signed out -> /sign-in, signed in but not the owner -> /circle.
  await requireAdmin()

  const supabase = await createClient()
  const { data, error: queryError } = await supabase
    .from("fragments")
    .select("*")
    .order("weight", { ascending: false })
    .order("id", { ascending: true })

  const error = queryError ? { message: queryError.message } : null
  const fragments = (data ?? []) as Fragment[]

  return (
    <main className="min-h-[100dvh] bg-neutral-950 px-6 py-20 text-neutral-200 lowercase">
      <div className="mx-auto flex max-w-xl flex-col gap-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-sm tracking-widest text-neutral-500">brain</h1>
          <p className="text-xs text-neutral-600">
            {error ? "" : `${fragments.length} fragments`}
          </p>
        </header>

        {error && (
          <pre className="whitespace-pre-wrap rounded-md border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">
            {error.message}
          </pre>
        )}

        {!error && fragments.length === 0 && (
          <p className="text-sm text-neutral-600">no fragments yet.</p>
        )}

        <div className="flex flex-col gap-14">
          {fragments.map((f) => {
            const questions = toQuestions(f.self_questions)
            return (
              <article key={f.id} className="flex flex-col gap-5">
                <div className="flex flex-col gap-3">
                  {f.title && (
                    <h2 className="text-lg leading-relaxed text-neutral-100">
                      {f.title}
                    </h2>
                  )}
                  {f.body && (
                    <p className="text-base leading-relaxed text-neutral-400">
                      {f.body}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600">
                  {f.archetype && <span>archetype · {f.archetype}</span>}
                  {f.tone && <span>tone · {f.tone}</span>}
                  {f.life_domain && <span>domain · {f.life_domain}</span>}
                </div>

                {questions.length > 0 && (
                  <ul className="flex flex-col gap-2 border-l border-neutral-800 pl-4">
                    {questions.map((q, i) => (
                      <li
                        key={i}
                        className="text-sm leading-relaxed text-neutral-500"
                      >
                        {q}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </main>
  )
}
