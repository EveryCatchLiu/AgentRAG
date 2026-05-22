import { useRef, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import {
  MessageSquare, Eye, Microscope, Search, FolderOpen, Settings,
} from "lucide-react"

const modules = [
  {
    icon: MessageSquare,
    title: "文档问答",
    subtitle: "Document Q&A",
    desc: "基于 RAG 的智能问答，上传文档后进行自然语言提问，获取精准、有来源引用的回答。",
    link: "/chat",
  },
  {
    icon: Eye,
    title: "视觉理解",
    subtitle: "Visual Understanding",
    desc: "上传图片或视频，结合多模态 Embedding 检索与 qwen3-vl 视觉模型进行深度分析。",
    link: "/chat",
  },
  {
    icon: Microscope,
    title: "深度研究",
    subtitle: "Deep Research",
    desc: "多 Agent 协作拆解复杂问题，并行执行子任务后汇总，适合多文档对比与综合分析。",
    link: "/chat",
  },
  {
    icon: Search,
    title: "知识检索",
    subtitle: "Knowledge Search",
    desc: "向量 + 关键词混合检索，RRF 融合排序，Cohere/LLM 重排序，支持多维度过滤。",
    link: "/chat",
  },
  {
    icon: FolderOpen,
    title: "知识库",
    subtitle: "Knowledge Base",
    desc: "上传和管理 PDF、图片、Word 等文档，Mistral OCR 自动处理扫描件，批量管理。",
    link: "/import",
  },
  {
    icon: Settings,
    title: "系统设置",
    subtitle: "Settings",
    desc: "配置 LLM 模型与平台、Embedding 模型、检索策略、Reranker 及第三方 API Key。",
    link: "/settings",
  },
]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  opacity: number
}

export default function WelcomeScreen({ onCreateThread }: { onCreateThread: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const animRef = useRef<number>(0)

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = []
    const count = Math.min(80, Math.floor((w * h) / 12000))
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
      })
    }
    particlesRef.current = particles
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initParticles(canvas.width, canvas.height)
    }
    resize()
    window.addEventListener("resize", resize)

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", onMouse)

    const animate = () => {
      const w = canvas.width
      const h = canvas.height
      const { x: mx, y: my } = mouseRef.current

      ctx.clearRect(0, 0, w, h)

      const particles = particlesRef.current
      for (const p of particles) {
        const dx = mx - p.x
        const dy = my - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 180 && dist > 1) {
          const force = 0.003
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
        }
        p.vx *= 0.999
        p.vy *= 0.999
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(232, 149, 76, ${p.opacity})`
        ctx.fill()
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 100) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(232, 149, 76, ${0.06 * (1 - dist / 100)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouse)
      cancelAnimationFrame(animRef.current)
    }
  }, [initParticles])

  return (
    <div className="relative flex-1 overflow-hidden bg-[#faf9f7]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0.7 }}
      />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-[0.08]"
          style={{
            background: "radial-gradient(circle, #e8954c 0%, transparent 70%)",
            animation: "float 16s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-1/2 -right-24 w-[30rem] h-[30rem] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, #d4704a 0%, transparent 70%)",
            animation: "float 20s ease-in-out infinite 3s",
          }}
        />
        <div
          className="absolute -bottom-28 left-1/3 w-80 h-80 rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, #e8954c 0%, transparent 70%)",
            animation: "float 18s ease-in-out infinite 6s",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-full px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] mb-5 shadow-lg shadow-[#e8954c]/25">
            <img src="/favicon.svg" alt="AgentRAG" className="w-9 h-9 brightness-0 invert" />
          </div>
          <h1 className="text-2xl font-bold text-[#3d3530] mb-2 tracking-tight">AgentRAG</h1>
          <p className="text-sm text-[#9e8b78] max-w-md leading-relaxed">
            智能文档助手 — 上传、检索、问答、视觉理解，一站式知识库平台
          </p>
          <button
            onClick={onCreateThread}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-[#e8954c]/20 hover:shadow-lg hover:shadow-[#e8954c]/30 hover:opacity-95 transition-all"
          >
            <MessageSquare className="h-4 w-4" />
            开始新对话
          </button>
        </div>

        {/* Module grid — 3x2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl w-full">
          {modules.map((m) => (
            <Link
              key={m.title}
              to={m.link}
              className="group relative rounded-2xl border border-[#e8e0d5] bg-white/90 backdrop-blur-sm p-6 hover:shadow-lg hover:border-[#d4c4b0] transition-all duration-300 hover:-translate-y-1"
            >
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] mb-4 shadow-sm">
                <m.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-semibold text-[#3d3530] mb-1">
                {m.title}
                <span className="ml-2 text-[11px] font-normal text-[#b8a48e] uppercase tracking-wide">{m.subtitle}</span>
              </h3>
              <p className="text-sm text-[#8b7a68] leading-relaxed">{m.desc}</p>
              <div className="absolute bottom-5 right-5 w-7 h-7 rounded-full bg-[#f5f1ec] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="h-3.5 w-3.5 text-[#8b5e3c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-[11px] text-[#c4b8a8]">
          点击任意模块进入对应功能界面 · 支持 PDF / Word / 图片 / 视频等多种格式
        </p>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(40px, -30px) scale(1.06); }
          50% { transform: translate(-20px, -50px) scale(0.94); }
          75% { transform: translate(-30px, -15px) scale(1.03); }
        }
      `}</style>
    </div>
  )
}
