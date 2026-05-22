import { useEffect, useCallback, useState } from "react"
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react"

interface MediaItem {
  url: string
  type: "image" | "video"
  filename?: string
}

interface MediaLightboxProps {
  items: MediaItem[]
  currentIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

export default function MediaLightbox({
  items,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: MediaLightboxProps) {
  const [zoomed, setZoomed] = useState(false)
  const current = items[currentIndex]

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") onPrev()
      if (e.key === "ArrowRight") onNext()
    },
    [onClose, onPrev, onNext]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = ""
    }
  }, [handleKeyDown])

  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-4 text-sm text-white/70">
        {currentIndex + 1} / {items.length}
      </div>

      {/* Filename */}
      {current.filename && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/80 truncate max-w-[60%]">
          {current.filename}
        </div>
      )}

      {/* Prev button */}
      {items.length > 1 && (
        <button
          onClick={onPrev}
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {/* Content */}
      <div className="flex items-center justify-center max-w-[90vw] max-h-[90vh]">
        {current.type === "image" ? (
          <img
            src={current.url}
            alt={current.filename || ""}
            className={`object-contain rounded-lg transition-transform duration-200 ${
              zoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"
            }`}
            style={{ maxWidth: "90vw", maxHeight: "90vh" }}
            onClick={() => setZoomed(!zoomed)}
          />
        ) : (
          <video
            src={current.url}
            controls
            autoPlay
            className="max-w-[90vw] max-h-[90vh] rounded-lg"
          />
        )}
      </div>

      {/* Next button */}
      {items.length > 1 && (
        <button
          onClick={onNext}
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      {/* Zoom toggle for images */}
      {current.type === "image" && (
        <button
          onClick={() => setZoomed(!zoomed)}
          className="absolute bottom-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        >
          {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
        </button>
      )}
    </div>
  )
}
