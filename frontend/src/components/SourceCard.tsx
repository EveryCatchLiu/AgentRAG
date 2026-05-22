import { useState } from "react"
import { ChevronDown, ChevronUp, FileText, Image, Video } from "lucide-react"
import type { Source } from "../lib/store"
import MediaLightbox from "./MediaLightbox"

interface SourceCardProps {
  source: Source
  onMediaClick?: (url: string, type: "image" | "video") => void
}

function SourceCard({ source, onMediaClick }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const similarityPercent = Math.round(source.similarity * 100)
  const hasMedia = source.media_url && source.media_type

  return (
    <div className="mt-1 rounded-lg border border-[#f0e0c8] bg-[#fefcf9] text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#fdf8f2]"
      >
        {hasMedia ? (
          source.media_type === "video" ? (
            <Video className="h-3 w-3 shrink-0 text-[#b8a48e]" />
          ) : (
            <Image className="h-3 w-3 shrink-0 text-[#b8a48e]" />
          )
        ) : (
          <FileText className="h-3 w-3 shrink-0 text-[#b8a48e]" />
        )}
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
          {hasMedia && (
            <div className="mb-2">
              {source.media_type === "image" ? (
                <img
                  src={source.media_url!}
                  alt={source.filename}
                  className="w-full max-h-48 object-cover rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => onMediaClick?.(source.media_url!, "image")}
                />
              ) : source.media_type === "video" ? (
                <div
                  className="relative w-full max-h-48 bg-black rounded-md cursor-pointer overflow-hidden"
                  onClick={() => onMediaClick?.(source.media_url!, "video")}
                >
                  <video
                    src={source.media_url!}
                    className="w-full max-h-48 object-cover opacity-70"
                    muted
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-white/80 p-2">
                      <svg className="h-5 w-5 text-[#8b5e3c]" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="8,5 19,12 8,19" />
                      </svg>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <p className="whitespace-pre-wrap text-xs leading-relaxed">
            {source.content}
          </p>
        </div>
      )}
    </div>
  )
}

export default function SourceList({ sources }: { sources: Source[] }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  if (!sources || sources.length === 0) return null

  const mediaSources = sources
    .filter((s) => s.media_url && s.media_type)
    .map((s) => ({
      url: s.media_url!,
      type: s.media_type as "image" | "video",
      filename: s.filename,
    }))

  const handleMediaClick = (url: string, type: "image" | "video") => {
    const idx = mediaSources.findIndex((m) => m.url === url)
    setLightboxIndex(idx >= 0 ? idx : 0)
    setLightboxOpen(true)
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-[#b8a48e]">
        Sources ({sources.length})
      </p>
      {sources.map((s, i) => (
        <SourceCard key={i} source={s} onMediaClick={handleMediaClick} />
      ))}

      {lightboxOpen && mediaSources.length > 0 && (
        <MediaLightbox
          items={mediaSources}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onPrev={() =>
            setLightboxIndex((prev) =>
              prev === 0 ? mediaSources.length - 1 : prev - 1
            )
          }
          onNext={() =>
            setLightboxIndex((prev) =>
              prev === mediaSources.length - 1 ? 0 : prev + 1
            )
          }
        />
      )}
    </div>
  )
}
