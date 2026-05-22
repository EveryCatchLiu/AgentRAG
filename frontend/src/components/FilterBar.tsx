import { useEffect, useState } from "react"
import { X, FileText, Tag, ChevronDown, ChevronUp, Filter } from "lucide-react"
import { useChatStore } from "../lib/store"

interface FilterData {
  files: { id: string; filename: string }[]
  topics: string[]
  document_types: string[]
}

export default function FilterBar({ userId }: { userId: string }) {
  const [filterData, setFilterData] = useState<FilterData | null>(null)
  const [expanded, setExpanded] = useState(false)
  const { filterFileIds, filterTopics, setFilterFileIds, setFilterTopics, clearFilters } =
    useChatStore()

  useEffect(() => {
    const fileParam = filterFileIds.length > 0 ? `&file_ids=${filterFileIds.join(",")}` : ""
    fetch(`/api/files/metadata/filters?user_id=${userId}${fileParam}`)
      .then((r) => r.json())
      .then(setFilterData)
      .catch(console.error)
  }, [userId, filterFileIds])

  const hasFilters = filterFileIds.length > 0 || filterTopics.length > 0

  if (!filterData || (filterData.files.length === 0 && filterData.topics.length === 0)) return null

  return (
    <div className="border-b border-[#e8e0d5]">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#9e8b78] hover:bg-[#fefaf5] transition-colors"
      >
        <Filter className="h-3.5 w-3.5" />
        <span>Filters</span>
        {hasFilters && (
          <span className="rounded-full bg-[#e8954c]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#e8954c]">
            {filterFileIds.length > 0 && `${filterFileIds.length} file${filterFileIds.length > 1 ? "s" : ""}`}
            {filterFileIds.length > 0 && filterTopics.length > 0 && ", "}
            {filterTopics.length > 0 && `${filterTopics.length} topic${filterTopics.length > 1 ? "s" : ""}`}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Expandable filter panel */}
      {expanded && (
        <div className="px-4 py-3 border-t border-[#f0e0c8]">
          <div className="flex items-end gap-3">
            {/* File filter */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-[#b8a48e]">
                <FileText className="h-3.5 w-3.5" />
                Files
                {filterFileIds.length > 0 && (
                  <span className="text-[#e8954c]">· {filterFileIds.length} selected</span>
                )}
              </label>
              <select
                multiple
                value={filterFileIds}
                onChange={(e) =>
                  setFilterFileIds(Array.from(e.target.selectedOptions, (o) => o.value))
                }
                className="w-full rounded-xl border border-[#e8e0d5] bg-white px-3 py-2 text-sm text-[#5c4a3a] focus:outline-none focus:ring-2 focus:ring-[#e8954c]/20"
                size={Math.min(Math.max(filterData.files.length, 3), 6)}
              >
                {filterData.files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </select>
            </div>

            {/* Topic filter */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-[#b8a48e]">
                <Tag className="h-3.5 w-3.5" />
                Topics
                {filterTopics.length > 0 && (
                  <span className="text-[#e8954c]">· {filterTopics.length} selected</span>
                )}
              </label>
              {filterData.topics.length > 0 ? (
                <select
                  multiple
                  value={filterTopics}
                  onChange={(e) =>
                    setFilterTopics(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                  className="w-full rounded-xl border border-[#e8e0d5] bg-white px-3 py-2 text-sm text-[#5c4a3a] focus:outline-none focus:ring-2 focus:ring-[#e8954c]/20"
                  size={Math.min(Math.max(filterData.topics.length, 3), 6)}
                >
                  {filterData.topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full rounded-xl border border-[#e8e0d5] bg-[#faf8f5] px-3 py-2 text-sm text-[#c4b49a]">
                  No topics available
                </div>
              )}
            </div>

            {/* Clear button */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c] transition-colors shrink-0 self-center"
              >
                <X className="h-4 w-4" />
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
