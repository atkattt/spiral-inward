"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { deleteAccount } from "@/app/actions/account"
import {
  BIRTH_DATA_KEY,
  BIRTH_NORMALIZED_KEY,
  CHART_KEY,
} from "@/lib/birth-data"
import { Starfield } from "@/components/starfield"
import { Button } from "@/components/ui/button"

type Feedback = { kind: "success" | "error"; message: string } | null

export function ProfileView({
  email,
  birthDate,
  birthTime,
  birthPlace,
}: {
  email: string
  birthDate: string | null
  birthTime: string | null
  birthPlace: string | null
}) {

  const [newEmail, setNewEmail] = useState("")
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null)
  const [emailSaving, setEmailSaving] = useState(false)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailFeedback(null)
    if (!newEmail.trim()) return
    setEmailSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setEmailSaving(false)
    if (error) {
      setEmailFeedback({ kind: "error", message: error.message })
      return
    }
    setEmailFeedback({
      kind: "success",
      message: "check both inboxes to confirm the change",
    })
    setNewEmail("")
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordFeedback(null)
    if (password.length < 8) {
      setPasswordFeedback({
        kind: "error",
        message: "password must be at least 8 characters",
      })
      return
    }
    if (password !== confirmPassword) {
      setPasswordFeedback({ kind: "error", message: "passwords don't match" })
      return
    }
    setPasswordSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setPasswordSaving(false)
    if (error) {
      setPasswordFeedback({ kind: "error", message: error.message })
      return
    }
    setPasswordFeedback({ kind: "success", message: "password updated" })
    setPassword("")
    setConfirmPassword("")
  }

  // Leaving must be a HARD navigation (window.location, not router.push):
  // the SpiralProvider lives in the root layout, so soft navigation would
  // carry this session's reads and the grown self avatar into the next
  // visit. Also clear the onboarding ritual's stashed birth data + chart.
  function clearLocalStash() {
    try {
      for (const key of [BIRTH_DATA_KEY, BIRTH_NORMALIZED_KEY, CHART_KEY]) {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      }
    } catch {
      // storage unavailable (private mode) — nothing stashed to clear.
    }
  }

  // Both exits go through the SERVER sign-out route: client-side cookie
  // deletion is silently dropped in the cross-site iframe preview, so only
  // the server can reliably expire the sb-* auth cookies.
  function handleSignOut() {
    clearLocalStash()
    window.location.href = "/auth/signout"
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    const { error } = await deleteAccount()
    if (error) {
      setDeleting(false)
      setDeleteError(error)
      return
    }
    // Data is gone; the sign-out route clears the session cookies.
    clearLocalStash()
    window.location.href = "/auth/signout"
  }

  return (
    <main className="relative min-h-[100dvh] overflow-y-auto bg-background">
      <Starfield count={70} />

      <header className="relative z-20 flex items-center px-5 pt-6">
        <Link
          href="/circle"
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          back
        </Link>
      </header>

      <div className="relative z-10 mx-auto max-w-md px-7 pb-24 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
          profile
        </p>

        {/* account */}
        <Section title="account">
          <Field label="email">
            <p className="font-mono text-sm text-foreground">{email}</p>
          </Field>

          <form onSubmit={handleChangeEmail} className="flex flex-col gap-2">
            <Field label="change email">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new email"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:outline-none"
              />
            </Field>
            <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/60">
              you&apos;ll get a confirmation email at both addresses
            </p>
            {emailFeedback && (
              <FeedbackLine feedback={emailFeedback} />
            )}
            <QuietButton disabled={emailSaving || !newEmail.trim()}>
              {emailSaving ? "saving…" : "save email"}
            </QuietButton>
          </form>

          <form
            onSubmit={handleChangePassword}
            className="mt-6 flex flex-col gap-2"
          >
            <Field label="change password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="new password"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:outline-none"
              />
            </Field>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="confirm password"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:outline-none"
            />
            {passwordFeedback && (
              <FeedbackLine feedback={passwordFeedback} />
            )}
            <QuietButton
              disabled={passwordSaving || !password || !confirmPassword}
            >
              {passwordSaving ? "saving…" : "save password"}
            </QuietButton>
          </form>
        </Section>

        {/* birth details */}
        <Section title="birth details">
          {birthDate ? (
            <div className="flex flex-col gap-3">
              <Field label="date">
                <p className="font-mono text-sm text-foreground">{birthDate}</p>
              </Field>
              <Field label="time">
                <p className="font-mono text-sm text-foreground">
                  {birthTime || "unknown"}
                </p>
              </Field>
              <Field label="place">
                <p className="font-mono text-sm text-foreground">
                  {birthPlace}
                </p>
              </Field>
            </div>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">
              no birth details yet
            </p>
          )}
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground/50">
            editing birth details recomputes your entire chart — coming soon
          </p>
        </Section>

        {/* session */}
        <Section title="session">
          <button
            onClick={handleSignOut}
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            sign out
          </button>
        </Section>

        {/* danger */}
        <Section title="danger">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="font-mono text-[11px] lowercase tracking-wide text-muted-foreground/60 underline underline-offset-4 transition-colors hover:text-destructive"
            >
              delete my account
            </button>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-destructive/30 p-4">
              <p className="font-mono text-xs leading-relaxed text-foreground">
                this permanently deletes your chart, your reads, and your
                conversations. this can&apos;t be undone.
              </p>
              {deleteError && (
                <p className="font-mono text-[11px] text-destructive">
                  {deleteError}
                </p>
              )}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="font-mono text-[11px] lowercase tracking-wide text-destructive underline underline-offset-4 transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  {deleting ? "deleting…" : "yes, delete everything"}
                </button>
                <button
                  onClick={() => {
                    setConfirmDelete(false)
                    setDeleteError(null)
                  }}
                  disabled={deleting}
                  className="font-mono text-[11px] lowercase tracking-wide text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </Section>
      </div>
    </main>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8 border-t border-border/50 pt-6">
      <h2 className="mb-4 font-serif text-lg font-light lowercase text-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
        {label}
      </span>
      {children}
    </div>
  )
}

function FeedbackLine({ feedback }: { feedback: NonNullable<Feedback> }) {
  return (
    <p
      className={
        feedback.kind === "error"
          ? "font-mono text-[11px] text-destructive"
          : "font-mono text-[11px] text-muted-foreground"
      }
    >
      {feedback.message}
    </p>
  )
}

function QuietButton({
  children,
  disabled,
}: {
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={disabled}
      className="mt-1 w-fit border-border bg-transparent font-mono text-[10px] uppercase tracking-widest text-foreground hover:bg-foreground/5"
    >
      {children}
    </Button>
  )
}
