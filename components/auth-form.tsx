"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

/**
 * Google OAuth is the only supported way in. Email/password is disabled at the
 * Supabase project level (`external.email = false`), so an email form could
 * never succeed here — it returned `422 email_provider_disabled` and rendered
 * "Email logins are disabled" to the user. The form is gone rather than
 * hidden so there is no dead path to fall back into.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [error, setError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

  const isSignUp = mode === "sign-up"

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)

    const supabase = createClient()
    // Google blocks its sign-in page inside iframes ("content is blocked").
    // In an iframe (e.g. the v0 preview) we must open the flow in a new tab,
    // so get the URL without auto-redirecting and navigate manually.
    const inIframe = window.self !== window.top
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/circle`,
        skipBrowserRedirect: inIframe,
        queryParams: {
          // Without this, Google silently reuses whichever account is already
          // signed in to the browser and never shows a chooser. Someone trying
          // to sign in with a DIFFERENT email lands back in their previous
          // account and sees that account's bonds on a supposedly new profile.
          // Forcing the chooser makes "use another email" actually work, and
          // makes signing out mean something.
          prompt: "select_account",
        },
      },
    })
    if (error) {
      setError(error.message || "Could not continue with Google")
      setGoogleLoading(false)
      return
    }
    if (inIframe && data?.url) {
      window.open(data.url, "_blank", "noopener,noreferrer")
      setGoogleLoading(false)
    }
    // Outside an iframe the browser navigates away to Google — no further state.
  }

  // Sign-up sits at the exact centre of the full-screen spiral, so the button
  // hugs its label and keeps a solid face the animation can't show through.
  if (isSignUp) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={googleLoading}
          onClick={handleGoogle}
          className="h-12 w-auto border-border/80 px-5 font-mono text-xs lowercase tracking-widest"
          style={{ borderRadius: "24px", backgroundColor: "#050505" }}
        >
          {googleLoading ? "one moment…" : "continue with google"}
        </Button>

        {error && (
          <p
            className="max-w-xs text-center font-mono text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={googleLoading}
        onClick={handleGoogle}
        className="h-12 rounded-full bg-transparent px-16 font-mono text-xs lowercase tracking-widest"
      >
        {googleLoading ? "one moment…" : "continue with google"}
      </Button>

      {error && (
        <p className="text-center font-mono text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <p className="text-center font-mono text-xs leading-relaxed text-muted-foreground">
        New here?{" "}
        <Link
          href="/sign-up"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Begin your chart
        </Link>
      </p>
    </div>
  )
}
