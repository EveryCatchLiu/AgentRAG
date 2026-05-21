import { useState } from "react"
import { ChevronDown, ChevronUp, FileText } from "lucide-react"
import type { Source } from "../lib/store"

function SourceCard({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false)
  const similarityPercent = Math.round(source.similarity * 100)

  return (
    <div className="mt-1 rounded border bg-background text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{source.filename}</span>
        <span className="shrink-0 text-muted-foreground">
          {similarityPercent}% match
        </span>
        {expanded ? (
          <ChevronUp className="ml-auto h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="ml-auto h-3 w-3 shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 text-muted-foreground">
          <p className="whitespace-pre-wrap text-xs leading-relaxed">
            {source.content}
          </p>
        </div>
      )}
    </div>
  )
}

export default function SourceList({ sources }: { sources: Source[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Sources ({sources.length})
      </p>
      {sources.map((s, i) => (
        <SourceCard key={i} source={s} />
      ))}
    </div>
  )
}
