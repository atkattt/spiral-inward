import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Server-side sign-out. Client-side `supabase.auth.signOut()` deletes the
// sb-* cookies with default attributes (SameSite=Lax), which the browser
// SILENTLY DROPS inside the cross-site iframe preview — the session cookie
// survives and "/" bounces the visitor straight back to /circle. Expiring
// the cookies here, with the SAME attributes used to set them (mirroring
// /guest), makes leaving actually leave.
export async function GET(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const cookieStore = await cookies()
  const isDev = process.env.NODE_ENV === "development"
  const attrs = {
    path: "/",
    maxAge: 0,
    sameSite: isDev ? ("none" as const) : ("lax" as const),
    secure: isDev ? true : undefined,
  }

  // Belt and braces: explicitly expire every supabase auth cookie, plus the
  // guest cookie, so both leave paths funnel through one clean exit.
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      cookieStore.set(cookie.name, "", attrs)
    }
  }
  cookieStore.set("spiral_guest", "", attrs)

  return NextResponse.redirect(new URL("/", request.url))
}
