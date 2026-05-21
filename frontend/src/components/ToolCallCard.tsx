import { useState } from "react"
import { Search, Database, Bot, FileSearch, Loader2, ChevronDown, ChevronUp, Check, X } from "lucide-react"
import type { ToolCall } from "../lib/store"
import ReasoningPanel from "./ReasoningPanel"

interface ToolCallCardProps {
  toolCall: ToolCall
  depth?: number
}

function ToolIcon({ name }: { name: string }) {
  const cls = "h-3 w-3"
  switch (name) {
    case "search_web":
      return <Search className={cls} />
    case "query_database":
      return <Database className={cls} />
    case "delegate_to_subagent":
      return <Bot className={cls} />
    case "search_document":
      return <FileSearch className={cls} />
    default:
      return <Database className={cls} />
  }
}

function ToolLabel({ name, task }: { name: string; task?: string }) {
  switch (name) {
    case "search_web":
      return <span className="font-medium">Web search</span>
    case "query_database":
      return <span className="font-medium">Database query</span>
    case "delegate_to_subagent":
      return (
        <span className="font-medium">
          Sub-agent
          {task ? `: ${task.length > 60 ? task.slice(0, 60) + "..." : task}` : ""}
        </span>
      )
    case "search_document":
      return <span className="font-medium">Document search</span>
    default:
      return <span className="font-medium">{name}</span>
  }
}

export default function ToolCallCard({ toolCall, depth = 0 }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-1" style={{ marginLeft: depth * 16 }}>
      <div className="rounded-[10px] border border-[#f0e0c8] bg-[#fefcf9] text-xs overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[#fdf8f2] text-left text-[#8b7355]"
        >
          <span className="text-muted-foreground">
            <ToolIcon name={toolCall.name} />
          </span>
          <span className="text-muted-foreground">
            <ToolLabel name={toolCall.name} task={toolCall.task} />
          </span>
          <span className="ml-auto flex items-center gap-1">
            {toolCall.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
            {toolCall.status === "done" && <Check className="h-3 w-3 text-green-500" />}
            {toolCall.status === "error" && <X className="h-3 w-3 text-red-500" />}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-[#f0e0c8] px-3 py-2 space-y-2">
            {/* Result */}
            {toolCall.result && (
              <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-60 overflow-y-auto">
                {toolCall.result}
              </p>
            )}

            {/* Sub-agent reasoning */}
            {toolCall.reasoning && toolCall.reasoning.length > 0 && (
              <ReasoningPanel reasoning={toolCall.reasoning} />
            )}

            {/* Nested children (sub-agent tool calls) */}
            {toolCall.children && toolCall.children.length > 0 && (
              <div className="space-y-1">
                {toolCall.children.map((child) => (
                  <ToolCallCard key={child.id} toolCall={child} depth={depth + 1} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
