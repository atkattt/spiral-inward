"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          // Fallback shell for any toast that ISN'T routed through
          // components/ui/terminal-toast. Hardcoded grey rather than
          // var(--popover), which is oklch(0.19 0.025 275) — chroma at hue 275
          // reads as navy blue, which is what made these look off-brand.
          "--normal-bg": "#232323",
          "--normal-text": "rgba(255,255,255,0.92)",
          "--normal-border": "rgba(255,255,255,0.16)",
          "--border-radius": "10px",
        } as React.CSSProperties
      }
      toastOptions={{
        // Terminal toasts draw their own grey/outlined shell, so sonner's box
        // would double the border and padding around them.
        unstyled: true,
        classNames: {
          toast: "cn-toast w-full",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
