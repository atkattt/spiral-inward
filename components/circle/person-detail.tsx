"use client"

import { useState, useTransition } from "react"
import type { Person, Relationship } from "@/lib/db/schema"
import { useCircleData } from "@/components/circle/circle-data-provider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Link2, Trash2, X, ChevronRight } from "lucide-react"
import { ReadCard } from "@/components/spiral/read-card"
import { useSpiral } from "@/components/spiral/spiral-provider"
import { makeBondRead, makePersonRead } from "@/lib/spiral/reads"
import { isSelfId } from "@/lib/relationships"

const MONO =
  "'Geist Pixel', ui-monospace, monospace"
// Glowing-white accent — never gold.
const GLOW = { color: "#f5f5f5", textShadow: "0 0 10px rgba(255,255,255,0.45)" }

function formatDate(value: string | null) {
  if (!value) return "Unknown"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function formatTime(value: string | null) {
  if (!value) return null
  const [h, m] = value.split(":")
  if (h === undefined || m === undefined) return value
  const hour = Number(h)
  const suffix = hour >= 12 ? "PM" : "AM"
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${m} ${suffix}`
}

type Bond = {
  relationship: Relationship
  other: Person
  label: string
}

export function PersonDetail({
  person,
  bonds,
  accentColor,
  onClose,
  onConnect,
}: {
  person: Person | null
  bonds: Bond[]
  accentColor?: string
  onClose: () => void
  onConnect: (person: Person) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [openBondId, setOpenBondId] = useState<number | null>(null)
  const { hasActed } = useSpiral()
  const { deletePerson, deleteRelationship } = useCircleData()

  const open = person !== null

  function handleDeletePerson() {
    if (!person) return
    startTransition(async () => {
      try {
        await deletePerson(person.id)
        toast(`${person.name} has left your sky`)
        setConfirmDelete(false)
        onClose()
      } catch {
        toast("Could not remove this person.")
      }
    })
  }

  function handleRemoveBond(relationshipId: number, label: string) {
    startTransition(async () => {
      try {
        await deleteRelationship(relationshipId)
        toast(`${label} bond released`)
      } catch {
        toast("Could not remove this bond.")
      }
    })
  }

  const time = person ? formatTime(person.birthTime) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setConfirmDelete(false)
          setOpenBondId(null)
          onClose()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[85vh] max-w-sm gap-0 overflow-y-auto p-6"
        style={{
          background: "#070707",
          border: "1px solid #1a1a1a",
          fontFamily: MONO,
        }}
      >
        {person && (
          <>
            <DialogHeader className="space-y-0">
              {/* meta line: accent glyph (left), terminal tag + close (right) */}
              <div
                className="mb-4 flex items-center justify-between"
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: "#4a4a4a",
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 rounded-[2px]"
                    style={{
                      backgroundColor: accentColor ?? "#9a9a9a",
                      boxShadow: accentColor
                        ? `0 0 10px 0 ${accentColor}aa`
                        : undefined,
                    }}
                  />
                  read
                </span>
                <button
                  onClick={onClose}
                  className="transition-colors hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
              <DialogTitle
                className="text-balance text-2xl font-normal"
                style={{ fontFamily: MONO, ...GLOW }}
              >
                {person.name}
              </DialogTitle>
            </DialogHeader>

            {/* Birth coordinates — mono label / glowing value rows */}
            <dl
              className="mt-5 flex flex-col gap-2.5 pt-4"
              style={{ borderTop: "1px solid #1a1a1a" }}
            >
              <Detail label="Born" value={formatDate(person.birthDate)} />
              <Detail
                label="Time"
                value={person.birthTimeUnknown ? "Unknown" : time ?? "Unknown"}
              />
              <Detail label="Place" value={person.birthPlace || "Unknown"} />
            </dl>

            {/* "You are here" — a read about this person, same agree/disagree loop */}
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid #1a1a1a" }}>
              {(() => {
                const personRead = makePersonRead(person.id, person.name)
                if (hasActed(personRead.id)) {
                  return <FiledRead label="you are here · filed" text={personRead.text} />
                }
                return <ReadCard read={personRead} label="You are here" />
              })()}
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: "1px solid #1a1a1a" }}>
              <p
                className="mb-3"
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: "#4a4a4a",
                }}
              >
                Bonds
              </p>
              {bonds.length === 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    letterSpacing: 0.3,
                    color: "#8a8a8a",
                  }}
                >
                  <span style={{ color: "#555" }}>{"› "}</span>
                  No bonds yet — connect {person.name} to someone in your circle.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {bonds.map((b) => {
                    const isOpen = openBondId === b.relationship.id
                    // The auto you↔them bond: the "other" endpoint is the
                    // user themself, so the row reads "{person} × You".
                    const isSelfBond = isSelfId(b.other.id)
                    const displayName = isSelfBond ? person.name : b.other.name
                    const bondRead = makeBondRead(b.relationship.id, displayName)
                    return (
                      <li key={b.relationship.id} className="flex flex-col gap-2">
                        <div
                          className="flex items-center justify-between gap-2 px-3 py-2.5"
                          style={{
                            border: "1px solid #1a1a1a",
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <button
                            onClick={() =>
                              setOpenBondId(isOpen ? null : b.relationship.id)
                            }
                            className="flex flex-1 items-center gap-2 text-left"
                            style={{
                              fontSize: 13,
                              letterSpacing: 0.3,
                              color: "#cfcfcf",
                            }}
                          >
                            <ChevronRight
                              className={`size-3.5 shrink-0 transition-transform ${
                                isOpen ? "rotate-90" : ""
                              }`}
                              style={{ color: "#555" }}
                            />
                            <span>
                              {displayName}
                              <span style={{ color: "#555" }}> × </span>
                              You
                              <span style={{ color: "#4a4a4a" }}>
                                {" · "}
                                {b.label}
                              </span>
                            </span>
                          </button>
                          <button
                            onClick={() =>
                              handleRemoveBond(b.relationship.id, b.label)
                            }
                            disabled={isPending}
                            className="transition-colors hover:text-destructive"
                            style={{ color: "#555" }}
                            aria-label={`Remove bond with ${displayName}`}
                          >
                            <X className="size-4" />
                          </button>
                        </div>

                        {isOpen &&
                          (hasActed(bondRead.id) ? (
                            <FiledRead
                              label="a bond read · filed"
                              text={bondRead.text}
                            />
                          ) : (
                            <ReadCard
                              read={bondRead}
                              label={`${displayName} × You`}
                              onResolved={() => setOpenBondId(null)}
                            />
                          ))}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <CommandButton
                onClick={() => onConnect(person)}
                icon={<Link2 className="size-3.5" />}
                label="connect to someone"
              />

              {confirmDelete ? (
                <div
                  className="flex flex-col gap-2 p-3"
                  style={{
                    border: "1px solid rgba(248,113,113,0.4)",
                    borderRadius: 8,
                  }}
                >
                  <p
                    className="text-center"
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      letterSpacing: 0.3,
                      color: "#8a8a8a",
                    }}
                  >
                    Remove {person.name} and all their bonds?
                  </p>
                  <div className="flex gap-2">
                    <CommandButton
                      onClick={() => setConfirmDelete(false)}
                      label="keep"
                    />
                    <CommandButton
                      onClick={handleDeletePerson}
                      disabled={isPending}
                      label="remove"
                      danger
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center justify-center gap-1.5 py-1 transition-colors hover:text-destructive"
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#555",
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Remove from circle
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A filed read, shown in the terminal voice (grey body behind a › prompt). */
function FiledRead({ label, text }: { label: string; text: string }) {
  return (
    <div
      className="p-4"
      style={{ border: "1px solid #1a1a1a", borderRadius: 8 }}
    >
      <p
        className="mb-2"
        style={{
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#4a4a4a",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.65,
          letterSpacing: 0.3,
          color: "#8a8a8a",
        }}
      >
        <span style={{ color: "#555" }}>{"› "}</span>
        {text}
      </p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt
        style={{
          width: 56,
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#4a4a4a",
        }}
      >
        {label}
      </dt>
      <dd style={{ fontSize: 13, letterSpacing: 0.4, ...GLOW }}>{value}</dd>
    </div>
  )
}

function CommandButton({
  onClick,
  label,
  icon,
  disabled,
  danger,
}: {
  onClick: () => void
  label: string
  icon?: React.ReactNode
  disabled?: boolean
  danger?: boolean
}) {
  const [hover, setHover] = useState(false)
  const baseColor = danger ? "#b46a6a" : "#7a7a7a"
  const hoverColor = danger ? "#f87171" : "#cfcfcf"
  const baseBorder = danger ? "rgba(248,113,113,0.35)" : "#1f1f1f"
  const hoverBorder = danger ? "rgba(248,113,113,0.6)" : "#3a3a3a"
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
        padding: "11px 16px",
        cursor: disabled ? "default" : "pointer",
        background: hover ? "rgba(255,255,255,0.03)" : "transparent",
        color: hover ? hoverColor : baseColor,
        opacity: disabled ? 0.6 : 1,
        transition: "all .16s",
        width: "100%",
        textAlign: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <span style={{ opacity: 0.5 }}>[</span>
      {icon}
      {label}
      <span style={{ opacity: 0.5 }}>]</span>
    </button>
  )
}

export type { Bond }
