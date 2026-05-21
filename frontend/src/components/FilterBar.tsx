import { useEffect, useState } from "react"
import { X, Filter, FileText, Tag } from "lucide-react"
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
    <div className="border-b px-4 py-3">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
          <Filter className="h-4 w-4" />
          Filter search scope
        </span>

        {/* File filter */}
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <select
            multiple
            value={filterFileIds}
            onChange={(e) =>
              setFilterFileIds(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            className="rounded border bg-background px-3 py-1.5 text-sm w-[220px] cursor-pointer overflow-x-auto whitespace-nowrap"
            size={Math.min(Math.max(filterData.files.length, 2), 5)}
          >
            {filterData.files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.filename}
              </option>
            ))}
          </select>
        </div>

        {/* Topic filter */}
        {filterData.topics.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <select
              multiple
              value={filterTopics}
              onChange={(e) =>
                setFilterTopics(Array.from(e.target.selectedOptions, (o) => o.value))
              }
              className="rounded border bg-background px-3 py-1.5 text-sm w-[220px] cursor-pointer overflow-x-auto whitespace-nowrap"
              size={Math.min(Math.max(filterData.topics.length, 2), 5)}
            >
              {filterData.topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Instruction hint */}
      <p className="mt-1.5 text-center text-xs text-muted-foreground/60">
        Hold Ctrl/Cmd to select multiple items. Leave empty to search all.
      </p>
    </div>
  )
}
