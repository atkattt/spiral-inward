"use client"

import { useState } from "react"
import { toast } from "@/components/ui/terminal-toast"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSpiral } from "@/components/spiral/spiral-provider"
import { REASON_TAGS, type Read, type ReasonTag } from "@/lib/spiral/reads"

const MONO =
  "'Geist Pixel', ui-monospace, monospace"

type Phase = "idle" | "agreeing" | "reasons" | "leaving"

export function ReadCard({
  read,
  onResolved,
  className,
  label,
}: {
  read: Read
  // Called once the read has been filed (agree or disagree) and the
  // exit animation has finished, so the parent can advance to the next read.
  onResolved?: () => void
  className?: string
  label?: string
}) {
  const { agree, disagree } = useSpiral()
  const [phase, setPhase] = useState<Phase>("idle")

  function handleAgree() {
    if (phase !== "idle") return
    setPhase("agreeing")
    toast.success("Filed to your spiral")
    window.setTimeout(() => {
      agree(read)
      onResolved?.()
    }, 850)
  }

  function handleDisagree() {
    if (phase !== "idle") return
    setPhase("reasons")
  }

  function handleReason(reason: ReasonTag) {
    disagree(read, reason)
    setPhase("leaving")
    toast(reason === "skip" ? "Filed to your history" : `Filed · ${reason}`)
    window.setTimeout(() => {
      onResolved?.()
    }, 400)
  }

  return (
    <div
      className={cn(
        "relative p-5",
        phase === "agreeing" && "animate-agree-glow",
        phase === "leaving" && "animate-card-fade-out",
        className,
      )}
      style={{
        background: "#070707",
        border: "1px solid #1a1a1a",
        borderRadius: 8,
        fontFamily: MONO,
      }}
    >
      {label && (
        <p
          className="mb-3"
          style={{
            fontSize: 10,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#4a4a4a",
          }}
        >
          {label}
        </p>
      )}

      <p
        className="transition-opacity"
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          letterSpacing: 0.4,
          color: "#cfcfcf",
          opacity: phase === "reasons" ? 0.4 : 1,
        }}
      >
        <span style={{ color: "#555" }}>{"› "}</span>
        {read.text}
      </p>

      {phase === "reasons" ? (
        <div className="mt-5">
          <p
            className="mb-3"
            style={{
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#4a4a4a",
            }}
          >
            What made it wrong?
          </p>
          <div className="flex flex-wrap gap-2">
            {REASON_TAGS.map((tag) => (
              <TagButton key={tag} onClick={() => handleReason(tag)} label={tag} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 flex gap-2.5">
          <CmdButton
            onClick={handleAgree}
            disabled={phase !== "idle"}
            icon={<Check className="size-3.5" />}
            label="agree"
            tone="agree"
          />
          <CmdButton
            onClick={handleDisagree}
            disabled={phase !== "idle"}
            icon={<X className="size-3.5" />}
            label="disagree"
          />
        </div>
      )}
    </div>
  )
}

function CmdButton({
  onClick,
  label,
  icon,
  disabled,
  tone,
}: {
  onClick: () => void
  label: string
  icon?: React.ReactNode
  disabled?: boolean
  tone?: "agree"
}) {
  const [hover, setHover] = useState(false)
  const isAgree = tone === "agree"
  const baseColor = isAgree ? "#7fae8a" : "#7a7a7a"
  const hoverColor = isAgree ? "#9fe0ac" : "#cfcfcf"
  const baseBorder = isAgree ? "rgba(127,174,138,0.35)" : "#1f1f1f"
  const hoverBorder = isAgree ? "rgba(127,174,138,0.6)" : "#3a3a3a"
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: MONO,
        fontSize: 12,
        letterSpacing: 1,
        border: `1px solid ${hover ? hoverBorder : baseBorder}`,
        borderRadius: 8,
        padding: "10px 14px",
        cursor: disabled ? "default" : "pointer",
        background: hover ? "rgba(255,255,255,0.03)" : "transparent",
        color: hover ? hoverColor : baseColor,
        opacity: disabled ? 0.6 : 1,
        transition: "all .16s",
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
      }}
    >
      <span style={{ opacity: 0.5 }}>[</span>
      {icon}
      {label}
      <span style={{ opacity: 0.5 }}>]</span>
    </button>
  )
}

function TagButton({ onClick, label }: { onClick: () => void; label: string }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: MONO,
        fontSize: 12,
        letterSpacing: 0.5,
        textTransform: "lowercase",
        border: `1px solid ${hover ? "#3a3a3a" : "#1f1f1f"}`,
        borderRadius: 999,
        padding: "6px 12px",
        cursor: "pointer",
        background: hover ? "rgba(255,255,255,0.03)" : "transparent",
        color: hover ? "#cfcfcf" : "#7a7a7a",
        transition: "all .16s",
      }}
    >
      {label}
    </button>
  )
}
