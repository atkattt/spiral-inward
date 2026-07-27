"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name.trim() || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        })
        if (error) throw new Error(error.message || "Could not create account")
        // Email confirmation is on: no session yet. If the email already
        // exists Supabase returns an obfuscated user with no identities.
        if (data.user && data.user.identities?.length === 0) {
          throw new Error("An account with this email already exists")
        }
        setEmailSent(true)
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw new Error(error.message || "Could not sign in")
      router.push("/circle")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  // After a successful sign-up we wait on email confirmation.
  if (emailSent) {
    return (
      <div className="flex w-full flex-col gap-4 text-center">
        <p className="font-serif text-lg font-light text-foreground">
          check your email
        </p>
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
          we sent a confirmation link to{" "}
          <span className="text-foreground">{email}</span>. open it to finish
          mapping your chart, then sign in.
        </p>
        <Link
          href="/sign-in"
          className="mt-2 font-mono text-xs uppercase tracking-widest text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  // Sign-up only shows Google OAuth.
  if (isSignUp) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={googleLoading}
        onClick={handleGoogle}
        className="h-12 border-border/80 font-mono text-xs lowercase tracking-widest"
        // Compact button sized to just the three words, with larger padding
        // (132px right, 137px left) and moderate rounded corners (24px instead
        // of full pill). Solid near-black background so the spiral never shows through.
        style={{
          paddingRight: "132px",
          paddingLeft: "137px",
          borderRadius: "24px",
          backgroundColor: "#050505",
        }}
      >
        {googleLoading ? "one moment…" : "continue with google"}
      </Button>
    )
  }

  // Sign-in shows email/password form with Google as secondary.
  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="email"
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          Email
        </Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="h-12 bg-input/40"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="password"
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          Password
        </Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="h-12 bg-input/40"
        />
      </div>

      {error && (
        <p className="font-mono text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={loading}
        className="mt-2 h-12 rounded-full font-mono text-sm uppercase tracking-widest"
      >
        {loading ? "One moment…" : "Enter"}
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-xs lowercase tracking-widest text-muted-foreground">
          or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={googleLoading || loading}
        onClick={handleGoogle}
        className="h-12 rounded-full font-mono text-xs lowercase tracking-widest bg-transparent px-16"
      >
        {googleLoading ? "one moment…" : "continue with google"}
      </Button>

      <p className="text-center font-mono text-xs text-muted-foreground">
        New here?{" "}
        <Link
          href="/sign-up"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Begin your chart
        </Link>
      </p>
    </form>
  )
}
