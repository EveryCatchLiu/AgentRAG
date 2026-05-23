import { useRef, useEffect } from "react"
import { Link } from "react-router-dom"

/* ── Pixel Icon ── */
function PixelIcon({ grid, color = "#e8954c" }: { grid: number[][]; color?: string }) {
  const size = 8; const cellSize = 3
  const cells: { x: number; y: number }[] = []
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r]?.[c]) cells.push({ x: c * cellSize, y: r * cellSize })
  return (
    <svg width={size * cellSize} height={size * cellSize} viewBox={`0 0 ${size * cellSize} ${size * cellSize}`} className="block">
      {cells.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={cellSize} height={cellSize} fill={color} shapeRendering="crispEdges" />
      ))}
    </svg>
  )
}

const iconDocQA = [[0,0,1,1,1,1,0,0],[0,1,1,1,1,1,1,0],[1,1,0,0,0,0,1,1],[1,1,0,1,1,0,1,1],[1,1,0,0,1,0,1,1],[1,1,0,1,1,1,1,1],[0,1,1,1,1,1,1,0],[0,0,1,1,0,1,0,0]]
const iconEye = [[0,0,0,0,0,0,0,0],[0,0,1,1,1,1,0,0],[0,1,1,1,1,1,1,0],[1,1,0,1,1,0,1,1],[1,1,0,1,1,0,1,1],[0,1,1,1,1,1,1,0],[0,0,1,1,1,1,0,0],[0,0,0,1,1,0,0,0]]
const iconResearch = [[0,0,1,1,1,1,0,0],[0,1,0,0,0,0,1,0],[1,0,0,1,0,0,0,1],[1,0,1,1,1,0,0,1],[1,0,0,1,0,0,0,1],[0,1,0,0,0,1,0,0],[0,0,1,1,1,0,1,0],[0,0,0,0,0,0,0,1]]
const iconSearch = [[0,0,1,1,1,0,0,0],[0,1,0,0,0,1,0,0],[1,0,0,0,0,0,1,0],[1,0,0,0,0,0,1,0],[0,1,0,0,0,1,0,0],[0,0,1,0,1,0,0,0],[0,0,0,1,0,0,0,0],[0,0,0,0,0,0,0,0]]
const iconFolder = [[1,1,1,1,0,0,0,0],[1,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0]]
const iconSettings = [[0,0,0,1,1,0,0,0],[0,0,1,0,0,1,0,0],[0,1,0,1,1,0,1,0],[1,0,0,1,1,0,0,1],[0,1,1,0,0,1,1,0],[0,0,1,0,0,1,0,0],[0,1,0,0,0,0,1,0],[0,0,1,1,1,1,0,0]]

const modules = [
  { icon: iconDocQA, title: "文档问答", subtitle: "Document Q&A", desc: "基于 RAG 的智能问答，上传文档后进行自然语言提问，获取精准、有来源引用的回答。", link: "/chat" },
  { icon: iconEye, title: "视觉理解", subtitle: "Visual Understanding", desc: "上传图片或视频，结合多模态 Embedding 检索与 qwen3-vl 视觉模型进行深度分析。", link: "/chat" },
  { icon: iconResearch, title: "深度研究", subtitle: "Deep Research", desc: "多 Agent 协作拆解复杂问题，并行执行子任务后汇总，适合多文档对比与综合分析。", link: "/chat" },
  { icon: iconSearch, title: "知识检索", subtitle: "Knowledge Search", desc: "向量 + 关键词混合检索，RRF 融合排序，Cohere/LLM 重排序，支持多维度过滤。", link: "/chat" },
  { icon: iconFolder, title: "知识库", subtitle: "Knowledge Base", desc: "上传和管理 PDF、图片、Word 等文档，Mistral OCR 自动处理扫描件，批量管理。", link: "/import" },
  { icon: iconSettings, title: "系统设置", subtitle: "Settings", desc: "配置 LLM 模型与平台、Embedding 模型、检索策略、Reranker 及第三方 API Key。", link: "/settings" },
]

function rand(a: number, b: number) { return a + Math.random() * (b - a) }

interface Firefly {
  angle: number; dist: number; speed: number; drift: number
  size: number; twinklePhase: number; twinkleSpeed: number; warmth: number
}

export default function WelcomeScreen({ onCreateThread }: { onCreateThread: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tetrisCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const firefliesRef = useRef<Firefly[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const w = window.innerWidth; const h = window.innerHeight
      const globeR = Math.min(w, h) * 0.28
      const ff: Firefly[] = []
      for (let i = 0; i < 22; i++) {
        ff.push({
          angle: rand(0, Math.PI * 2),
          dist: rand(0.05, globeR * 0.88),
          speed: rand(0.0003, 0.001),
          drift: rand(-0.0002, 0.0002),
          size: rand(1.5, 3.5),
          twinklePhase: rand(0, Math.PI * 2),
          twinkleSpeed: rand(2, 6),
          warmth: Math.random(),
        })
      }
      firefliesRef.current = ff
    }
    resize()
    window.addEventListener("resize", resize)

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
      if (containerRef.current) {
        // Calculate mouse position relative to the entire page for the feather mask
        containerRef.current.style.setProperty("--mx", `${(e.clientX / window.innerWidth) * 100}%`)
        containerRef.current.style.setProperty("--my", `${(e.clientY / window.innerHeight) * 100}%`)
      }
    }
    window.addEventListener("mousemove", onMouse)

    const animate = (timestamp: number) => {
      const w = window.innerWidth; const h = window.innerHeight
      timeRef.current = timestamp

      ctx.clearRect(0, 0, w, h)

      const globeCx = w * 0.5; const globeCy = h * 0.42; const globeR = Math.min(w, h) * 0.28
      const mx = mouseRef.current.x * w; const my = mouseRef.current.y * h

      for (const ff of firefliesRef.current) {
        ff.angle += ff.speed + ff.drift * Math.sin(timeRef.current * 0.0004 + ff.twinklePhase)
        ff.dist += Math.sin(timeRef.current * 0.0006 + ff.twinklePhase) * 0.02

        // Base orbital position
        let fx = globeCx + Math.cos(ff.angle) * ff.dist * globeR
        let fy = globeCy + Math.sin(ff.angle) * ff.dist * globeR * 0.78

        // Mouse attraction — fireflies drift toward cursor
        const dx = mx - fx; const dy = my - fy
        const distToMouse = Math.sqrt(dx * dx + dy * dy)
        const attractRadius = globeR * 0.7
        if (distToMouse < attractRadius && distToMouse > 1) {
          const pull = (1 - distToMouse / attractRadius) * 0.3
          fx += dx * pull
          fy += dy * pull
        }

        const twinkle = 0.2 + 0.8 * Math.sin(timeRef.current * 0.004 * ff.twinkleSpeed + ff.twinklePhase)

        const wm = ff.warmth
        const cr = wm < 0.4 ? 255 : wm < 0.7 ? 255 : 220
        const cg = wm < 0.4 ? 240 : wm < 0.7 ? 220 : 200
        const cb = wm < 0.4 ? 180 : wm < 0.7 ? 150 : 230

        const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, ff.size * 5)
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${twinkle * 0.5})`)
        grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},${twinkle * 0.12})`)
        grad.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = grad
        ctx.fillRect(fx - ff.size * 5, fy - ff.size * 5, ff.size * 10, ff.size * 10)

        ctx.fillStyle = `rgba(255,250,225,${twinkle * 0.6})`
        ctx.beginPath()
        ctx.arc(fx, fy, ff.size * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }

      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouse)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  /* ════════ Tetris block animation ════════ */
  useEffect(() => {
    const canvas = tetrisCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const CELL = 10

    // Tetris shapes as 2D grids
    const SHAPES: number[][][] = [
      [[1,1,1,1]],                          // I
      [[1,1],[1,1]],                         // O
      [[0,1,0],[1,1,1]],                     // T
      [[1,0,0],[1,1,1]],                     // J
      [[0,0,1],[1,1,1]],                     // L
      [[0,1,1],[1,1,0]],                     // S
      [[1,1,0],[0,1,1]],                     // Z
    ]

    const COLORS = ["#e8d8c8", "#dcc8b4", "#e0d0c0", "#d8c8b8", "#e4d4c4", "#d4c4b4", "#ecdcc8"]

    interface TetrisBlock {
      shape: number[][]; color: string
      x: number; y: number; vx: number; vy: number
      opacity: number; falling: boolean
    }

    const blocks: TetrisBlock[] = []
    let w = 0; let h = 0
    let mx = 0; let my = 0

    const spawn = () => {
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      blocks.push({
        shape, color,
        x: rand(50, w - 150), y: rand(-100, -20),
        vx: rand(-0.6, 0.6), vy: rand(0.1, 0.5),
        opacity: 1, falling: false,
      })
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      w = window.innerWidth; h = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    // Spawn initial blocks
    for (let i = 0; i < 6; i++) spawn()

    const onMouse = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    window.addEventListener("mousemove", onMouse)

    const animate = () => {
      ctx.clearRect(0, 0, w, h)

      // Spawn new blocks periodically
      if (blocks.length < 8 && Math.random() < 0.008) spawn()

      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i]
        const bw = b.shape[0].length * CELL
        const bh = b.shape.length * CELL

        // Mouse interaction — push away
        const cx = b.x + bw / 2; const cy = b.y + bh / 2
        const dx = mx - cx; const dy = my - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 150 && dist > 1) {
          b.vx -= (dx / dist) * 0.2
          b.vy -= (dy / dist) * 0.2
          b.falling = true
        }

        // Gravity (stronger when falling)
        b.vy += b.falling ? 0.06 : 0.01
        b.vx *= 0.993; b.vy *= 0.993
        b.x += b.vx; b.y += b.vy

        // Bounce off walls
        if (b.x < 0) { b.x = 0; b.vx *= -0.6 }
        if (b.x + bw > w) { b.x = w - bw; b.vx *= -0.6 }
        if (b.y < 0) { b.y = 0; b.vy *= -0.6 }

        // Fall off bottom — fade and respawn
        if (b.y > h + 40) {
          blocks.splice(i, 1)
          spawn()
          continue
        }

        // Near bottom — fade out
        if (b.y > h - 100) {
          b.opacity = Math.max(0, 1 - (b.y - (h - 100)) / 100)
        } else if (b.opacity < 1 && !b.falling) {
          b.opacity = Math.min(1, b.opacity + 0.02)
        }

        // Simple block-block collision
        for (let j = i + 1; j < blocks.length; j++) {
          const o = blocks[j]
          const obw = o.shape[0].length * CELL; const obh = o.shape.length * CELL
          if (b.x < o.x + obw && b.x + bw > o.x && b.y < o.y + obh && b.y + bh > o.y) {
            const overlapX = Math.min(b.x + bw - o.x, o.x + obw - b.x)
            const overlapY = Math.min(b.y + bh - o.y, o.y + obh - b.y)
            if (overlapX < overlapY) {
              const pushX = overlapX / 2
              b.x -= b.x < o.x ? pushX : -pushX
              o.x += b.x < o.x ? pushX : -pushX
              b.vx *= -0.5; o.vx *= -0.5
            } else {
              const pushY = overlapY / 2
              b.y -= b.y < o.y ? pushY : -pushY
              o.y += b.y < o.y ? pushY : -pushY
              b.vy *= -0.5; o.vy *= -0.5
            }
          }
        }

        // Draw block
        ctx.globalAlpha = b.opacity
        for (let r = 0; r < b.shape.length; r++) {
          for (let c = 0; c < b.shape[r].length; c++) {
            if (b.shape[r][c]) {
              ctx.fillStyle = b.color
              ctx.fillRect(b.x + c * CELL, b.y + r * CELL, CELL - 1, CELL - 1)
            }
          }
        }
        ctx.globalAlpha = 1
      }

      requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouse)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative flex-1 w-full h-full overflow-hidden"
      style={{ background: "linear-gradient(135deg, #fef9f5 0%, #faf5ef 30%, #f8f2ea 60%, #fdf7f2 100%)" }}
    >
      {/* ═══ Crystal Globe — centered, medium-large ═══ */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[30%] pointer-events-none"
        style={{
          width: "min(70vw, 70vh)",
          height: "min(70vw, 70vh)",
          zIndex: 1,
        }}
      >
        {/* Video — circle with mouse-following feather mask */}
        <div className="absolute inset-0 overflow-hidden"
          style={{
            clipPath: "circle(48% at 50% 50%)",
            WebkitClipPath: "circle(48% at 50% 50%)",
            WebkitMaskImage: "radial-gradient(circle farthest-side at var(--mx, 50%) var(--my, 50%), black 0%, black 42%, transparent 78%)",
            maskImage: "radial-gradient(circle farthest-side at var(--mx, 50%) var(--my, 50%), black 0%, black 42%, transparent 78%)",
          }}
        >
          <video
            src="https://mmguo.dev/assets/back.mp4"
            autoPlay loop muted playsInline
            style={{
              position: "absolute",
              left: "calc(50% + (var(--mx, 50%) - 50%) * 0.08)",
              top: "calc(50% + (var(--my, 50%) - 50%) * 0.08)",
              transform: "translate(-50%, -50%)",
              minWidth: "110%", minHeight: "110%",
              width: "110%", height: "auto",
              objectFit: "cover",
              transition: "left 0.3s ease-out, top 0.3s ease-out",
            }}
          />
        </div>

        {/* Soft misty halo */}
        <div className="absolute pointer-events-none"
          style={{
            inset: "-3%",
            clipPath: "circle(49% at 50% 50%)",
            WebkitClipPath: "circle(49% at 50% 50%)",
            background: "radial-gradient(circle at 50% 50%, transparent 48%, rgba(250,245,240,0.2) 68%, rgba(248,238,228,0.5) 86%, #fdf7f2 96%)",
            filter: "blur(12px)",
          }}
        />

      </div>

      {/* ═══ Canvas: tetris blocks (behind everything) ═══ */}
      <canvas ref={tetrisCanvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} />

      {/* ═══ Canvas: fireflies ═══ */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }} />

      {/* ═══ Floating pixel icons — dynamic background ═══ */}
      {[
        { shape: "cross" as const, x: "8%", y: "15%", size: 4, color: "#e8d8c8", dur: 18, delay: 0 },
        { shape: "square" as const, x: "88%", y: "22%", size: 3, color: "#e0d0c0", dur: 22, delay: 3 },
        { shape: "diamond" as const, x: "15%", y: "72%", size: 5, color: "#dcc8b4", dur: 20, delay: 5 },
        { shape: "lshape" as const, x: "92%", y: "68%", size: 3, color: "#e4d4c4", dur: 16, delay: 2 },
        { shape: "cross" as const, x: "45%", y: "10%", size: 3, color: "#d8c8b8", dur: 24, delay: 7 },
        { shape: "square" as const, x: "55%", y: "85%", size: 4, color: "#e0d0c0", dur: 19, delay: 4 },
        { shape: "diamond" as const, x: "78%", y: "45%", size: 3, color: "#dcc8b8", dur: 21, delay: 8 },
        { shape: "cross" as const, x: "22%", y: "38%", size: 5, color: "#e8d8c8", dur: 17, delay: 1 },
        { shape: "lshape" as const, x: "68%", y: "12%", size: 4, color: "#e4d4c4", dur: 23, delay: 6 },
        { shape: "square" as const, x: "35%", y: "55%", size: 3, color: "#d8c8b8", dur: 20, delay: 9 },
      ].map((f, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: f.x, top: f.y,
            animationName: `pixel-float-${(i % 4) + 1}`,
            animationDuration: `${f.dur}s`,
            animationDelay: `${f.delay}s`,
            animationIterationCount: "infinite",
            animationTimingFunction: "ease-in-out",
          }}
        >
          {(() => {
            const s = f.size
            let shadows: string
            if (f.shape === "cross") shadows = `${s}px 0 0 ${f.color},-${s}px 0 0 ${f.color},0 ${s}px 0 ${f.color},0 -${s}px 0 ${f.color}`
            else if (f.shape === "square") shadows = `${s}px 0 0 ${f.color},0 ${s}px 0 ${f.color},${s}px ${s}px 0 ${f.color}`
            else if (f.shape === "diamond") shadows = `${s}px ${s}px 0 ${f.color},-${s}px ${s}px 0 ${f.color},${s}px -${s}px 0 ${f.color},-${s}px -${s}px 0 ${f.color}`
            else shadows = `0 ${s}px 0 ${f.color},0 ${s * 2}px 0 ${f.color},${s}px ${s * 2}px 0 ${f.color}`
            return <div style={{ width: s, height: s, background: f.color, boxShadow: shadows, imageRendering: "pixelated" }} />
          })()}
        </div>
      ))}

      {/* ═══ AgentRAG content ═══ */}
      <div className="absolute inset-0 flex flex-col items-center justify-start pt-[10vh] px-6 pb-10 overflow-auto gap-8"
        style={{ pointerEvents: "none", zIndex: 3 }}
      >
        <div className="text-center" style={{ pointerEvents: "auto" }}>
          <h1 className="text-5xl font-bold text-[#3d3530] mb-2 tracking-tight">
            AgentRAG
          </h1>
          <p className="text-base text-[#8b7a68] mb-5">
            AI 驱动的多模态知识库与智能检索平台
          </p>
          <button
            onClick={onCreateThread}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90"
            style={{
              background: "#e8954c",
              boxShadow: "3px 0 0 #d4704a, 6px 0 0 #c0603a, 3px 3px 0 #d4704a, 6px 3px 0 #c0603a, 0 3px 0 #d4704a, 0 6px 0 #c0603a, 3px 6px 0 #d4704a, 6px 6px 0 #c0603a",
              imageRendering: "pixelated",
            }}
          >
            <PixelIcon grid={iconDocQA} color="#fff" />
            开始新对话
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl w-full" style={{ pointerEvents: "auto" }}>
          {modules.map((m) => (
            <Link
              key={m.title}
              to={m.link}
              className="group relative p-6 transition-all duration-300 hover:-translate-y-1"
              style={{
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(4px)",
                border: "2px solid #e0d8cc",
                boxShadow: "4px 0 0 #e0d8cc, 0 4px 0 #e0d8cc, 4px 4px 0 #e0d8cc",
                imageRendering: "pixelated",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#d4c4b0"
                e.currentTarget.style.boxShadow = "4px 0 0 #d4c4b0, 0 4px 0 #d4c4b0, 4px 4px 0 #d4c4b0, 2px 2px 16px rgba(180,140,100,0.2)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e0d8cc"
                e.currentTarget.style.boxShadow = "4px 0 0 #e0d8cc, 0 4px 0 #e0d8cc, 4px 4px 0 #e0d8cc"
              }}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 mb-4"
                style={{
                  background: "#fdf5ec",
                  border: "2px solid #e8954c",
                  boxShadow: "3px 0 0 #e8954c, 0 3px 0 #e8954c, 3px 3px 0 #e8954c",
                  imageRendering: "pixelated",
                }}
              >
                <PixelIcon grid={m.icon} color="#d4704a" />
              </div>
              <h3 className="text-base font-semibold text-[#3d3530] mb-1">
                {m.title}
                <span className="ml-2 text-[10px] font-normal text-[#b8a48e] uppercase tracking-wide" style={{ fontFamily: "'Silkscreen', monospace" }}>
                  {m.subtitle}
                </span>
              </h3>
              <p className="text-sm text-[#8b7a68] leading-relaxed">{m.desc}</p>
              <div
                className="absolute bottom-5 right-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ width: 20, height: 20, background: "#f5f1ec", border: "2px solid #d4c4b0" }}
              >
                <svg className="w-3 h-3 text-[#8b5e3c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
