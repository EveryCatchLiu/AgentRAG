import MarkdownMessage from "./MarkdownMessage"
import SubtaskCard from "./SubtaskCard"
import type { Decomposition } from "../lib/store"

interface DecompositionCardProps {
  decomposition: Decomposition
}

export default function DecompositionCard({ decomposition }: DecompositionCardProps) {
  return (
    <div className="rounded-xl border border-[#f0e0c8] bg-[#fefcf9] overflow-hidden">
      {/* Analysis header */}
      <div className="px-4 py-3 border-b border-[#f0e0c8]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-[#e8954c] uppercase tracking-wide">
            Task Decomposition
          </span>
        </div>
        <MarkdownMessage content={decomposition.analysis} />
      </div>

      {/* Subtask list */}
      <div className="px-4 py-3 space-y-2">
        <span className="text-[11px] font-medium text-[#9e8b78] uppercase tracking-wide">
          Subtasks ({decomposition.subtasks.filter(s => s.status === "done").length}/{decomposition.subtasks.length})
        </span>
        {decomposition.subtasks.map((subtask) => (
          <SubtaskCard key={subtask.id} subtask={subtask} />
        ))}
      </div>
    </div>
  )
}
