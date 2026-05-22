import { Loader2, Check, X, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import type { Subtask } from "../lib/store"

interface SubtaskCardProps {
  subtask: Subtask
}

export default function SubtaskCard({ subtask }: SubtaskCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-[#f0e0c8] bg-[#fefcf9] text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[#fdf8f2] text-left"
      >
        <span className="flex items-center gap-1.5 text-[#8b7355]">
          {subtask.status === "pending" && <span className="h-2 w-2 rounded-full bg-[#d4c8b8]" />}
          {subtask.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-[#e8954c]" />}
          {subtask.status === "done" && <Check className="h-3 w-3 text-green-500" />}
          {subtask.status === "error" && <X className="h-3 w-3 text-red-500" />}
          <span className={`font-medium ${subtask.status === "done" ? "text-[#5c4a3a]" : "text-[#8b7355]"}`}>
            {subtask.description.length > 80
              ? subtask.description.slice(0, 80) + "..."
              : subtask.description}
          </span>
        </span>
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-3 w-3 text-[#9e8b78]" /> : <ChevronDown className="h-3 w-3 text-[#9e8b78]" />}
        </span>
      </button>

      {expanded && (subtask.answer || subtask.error) && (
        <div className="border-t border-[#f0e0c8] px-3 py-2">
          {subtask.error ? (
            <p className="text-red-500">{subtask.error}</p>
          ) : (
            <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-60 overflow-y-auto">
              {subtask.answer}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
