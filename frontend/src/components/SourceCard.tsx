import { useState } from "react"
import { ChevronDown, ChevronUp, FileText } from "lucide-react"
import type { Source } from "../lib/store"

function SourceCard({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false)
  const similarityPercent = Math.round(source.similarity * 100)

  return (
    <div className="mt-1 rounded-lg border border-[#f0e0c8] bg-[#fefcf9] text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#fdf8f2]"
      >
        <FileText className="h-3 w-3 shrink-0 text-[#b8a48e]" />
        <span className="truncate font-medium text-[#8b5e3c]">{source.filename}</span>
        <span className="shrink-0 text-[#d4905e] font-medium">
          {similarityPercent}% match
        </span>
        {expanded ? (
          <ChevronUp className="ml-auto h-3 w-3 shrink-0 text-[#b8a48e]" />
        ) : (
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-[#b8a48e]" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-[#f0e0c8] px-3 py-2 text-[#9e8b78]">
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
      <p className="text-xs font-medium text-[#b8a48e]">
        Sources ({sources.length})
      </p>
      {sources.map((s, i) => (
        <SourceCard key={i} source={s} />
      ))}
    </div>
  )
}
