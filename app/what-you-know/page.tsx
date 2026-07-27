import { redirect } from "next/navigation"

// "what you know" now lives as a section inside /self — this route only
// survives so old links and muscle memory still land somewhere sensible.
export default function WhatYouKnowPage() {
  redirect("/self")
}
