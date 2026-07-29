"use client"

import { useState, useTransition } from "react"
import type { Person } from "@/lib/db/schema"
import { useCircleData } from "@/components/circle/circle-data-provider"
import {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_LABELS,
  type RelationshipKind,
} from "@/lib/relationships"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/terminal-toast"

export function ConnectDialog({
  from,
  people,
  onClose,
}: {
  from: Person | null
  people: Person[]
  onClose: () => void
}) {
  const [toId, setToId] = useState<string>("")
  const [kind, setKind] = useState<RelationshipKind | "">("")
  const [isPending, startTransition] = useTransition()
  const { addRelationship } = useCircleData()

  const open = from !== null
  const others = people.filter((p) => p.id !== from?.id)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!from || !toId || !kind) return

    startTransition(async () => {
      try {
        await addRelationship(from.id, Number(toId), kind)
        const other = people.find((p) => p.id === Number(toId))
        toast(`${from.name} & ${other?.name} are now bound`)
        setToId("")
        setKind("")
        onClose()
      } catch {
        toast("Could not create this bond.")
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setToId("")
          setKind("")
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-sm border-border bg-popover">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-light">
            Draw a bond
          </DialogTitle>
          <DialogDescription className="font-mono text-xs uppercase tracking-widest">
            From {from?.name}
          </DialogDescription>
        </DialogHeader>

        {others.length === 0 ? (
          <p className="py-4 text-center font-serif text-sm italic text-muted-foreground">
            Add another person to your circle first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Relationship
              </Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as RelationshipKind)}
              >
                <SelectTrigger className="bg-input/40">
                  <SelectValue placeholder="Choose a bond" />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {RELATIONSHIP_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                With
              </Label>
              <Select value={toId} onValueChange={(v) => setToId(v ?? "")}>
                <SelectTrigger className="bg-input/40">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={isPending || !toId || !kind}
              className="mt-2 w-full rounded-full font-mono text-xs uppercase tracking-widest"
            >
              {isPending ? "Binding…" : "Create bond"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
