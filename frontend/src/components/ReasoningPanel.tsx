import { useState } from "react"
import { Brain, ChevronDown, ChevronUp } from "lucide-react"

interface ReasoningPanelProps {
  reasoning: string[]
}

export default function ReasoningPanel({ reasoning }: ReasoningPanelProps) {
  const [expanded, setExpanded] = useState(false)

  if (!reasoning || reasoning.length === 0) return null

  return (
    <div className="mt-1 rounded-[10px] border border-dashed border-[#e8d5b8] bg-[#fefcf9] text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[#b8a48e] hover:bg-[#fdf8f2]"
      >
        <Brain className="h-3 w-3" />
        <span>Thinking ({reasoning.length} step{reasoning.length > 1 ? "s" : ""})</span>
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-dashed border-[#e8d5b8]">
          {reasoning.map((step, i) => (
            <div
              key={i}
              className="border-b border-dashed border-[#f0e0c8] px-3 py-2 text-[#9e8b78] whitespace-pre-wrap last:border-b-0"
            >
              {step.length > 500 ? step.slice(0, 500) + "..." : step}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
