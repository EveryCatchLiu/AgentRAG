import { useEffect, useState } from "react"
import { X, FileText, Tag } from "lucide-react"
import { useChatStore } from "../lib/store"

interface FilterData {
  files: { id: string; filename: string }[]
  topics: string[]
  document_types: string[]
}

export default function FilterBar({ userId }: { userId: string }) {
  const [filterData, setFilterData] = useState<FilterData | null>(null)
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
    <div className="border-b border-[#e8e0d5] bg-[#faf8f5] px-4 py-2.5">
      <div className="flex items-center gap-3">
        {/* File filter */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="h-4 w-4 text-[#b8a48e] shrink-0" />
          <div className="relative flex-1 min-w-0">
            <select
              multiple
              value={filterFileIds}
              onChange={(e) =>
                setFilterFileIds(Array.from(e.target.selectedOptions, (o) => o.value))
              }
              className="w-full rounded-xl border border-[#e8e0d5] bg-white px-3 py-2 text-sm text-[#5c4a3a] cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-[#e8954c]/20"
              size={Math.min(Math.max(filterData.files.length, 2), 5)}
            >
              {filterData.files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.filename}
                </option>
              ))}
            </select>
            <span className="absolute left-3 top-1.5 text-[10px] text-[#b8a48e] pointer-events-none">
              Files {filterFileIds.length > 0 ? `(${filterFileIds.length})` : ""}
            </span>
          </div>
        </div>

        {/* Topic filter */}
        {filterData.topics.length > 0 ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Tag className="h-4 w-4 text-[#b8a48e] shrink-0" />
            <div className="relative flex-1 min-w-0">
              <select
                multiple
                value={filterTopics}
                onChange={(e) =>
                  setFilterTopics(Array.from(e.target.selectedOptions, (o) => o.value))
                }
                className="w-full rounded-xl border border-[#e8e0d5] bg-white px-3 py-2 text-sm text-[#5c4a3a] cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-[#e8954c]/20"
                size={Math.min(Math.max(filterData.topics.length, 2), 5)}
              >
                {filterData.topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="absolute left-3 top-1.5 text-[10px] text-[#b8a48e] pointer-events-none">
                Topics {filterTopics.length > 0 ? `(${filterTopics.length})` : ""}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0" />
        )}

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c] transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
