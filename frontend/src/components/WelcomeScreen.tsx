import { FileText, Upload, Search, Bot, Database, ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

const features = [
  {
    icon: FileText,
    title: "Document Q&A",
    desc: "Ask questions and get answers grounded in your documents. Supports PDF, DOCX, markdown and more.",
    action: "Create a thread to start",
    color: "from-[#e8954c] to-[#d4704a]",
    bg: "bg-[#fefaf5] border-[#f0d8b8]",
  },
  {
    icon: Upload,
    title: "File Import & OCR",
    desc: "Upload PDFs, images, and documents. Mistral OCR extracts text from scanned files and images automatically.",
    action: "Go to Import",
    link: "/import",
    color: "from-[#d4905e] to-[#c4784a]",
    bg: "bg-[#fdf8f2] border-[#f0d8c0]",
  },
  {
    icon: Search,
    title: "Web Search",
    desc: "Real-time web search for current events, weather, news — automatically triggered when documents can't answer.",
    action: "Ask about weather, news, etc.",
    color: "from-[#c48850] to-[#b06838]",
    bg: "bg-[#fdf6f0] border-[#eed5b8]",
  },
  {
    icon: Bot,
    title: "Sub-agent Analysis",
    desc: "Deep full-document analysis with isolated sub-agents. Ideal for summaries, comparisons, and detailed reviews.",
    action: "Ask to summarize a document",
    color: "from-[#e8954c] to-[#c47042]",
    bg: "bg-[#fefaf5] border-[#f0d8b8]",
  },
  {
    icon: Database,
    title: "Hybrid Search",
    desc: "Vector + keyword retrieval with RRF fusion and LLM reranking for the most relevant results across all documents.",
    action: "Try searching across files",
    color: "from-[#d4905e] to-[#b86840]",
    bg: "bg-[#fdf8f2] border-[#f0d8c0]",
  },
]

export default function WelcomeScreen({ onCreateThread }: { onCreateThread: () => void }) {
  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, #e8954c 0%, transparent 70%)",
            animation: "float 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-1/3 -right-16 w-80 h-80 rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, #d4704a 0%, transparent 70%)",
            animation: "float 15s ease-in-out infinite 2s",
          }}
        />
        <div
          className="absolute -bottom-20 left-1/4 w-64 h-64 rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, #f0a860 0%, transparent 70%)",
            animation: "float 18s ease-in-out infinite 4s",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-48 h-48 rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, #e8954c 0%, transparent 70%)",
            animation: "float 10s ease-in-out infinite 1s",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-full px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] mb-5 shadow-lg shadow-[#e8954c]/20">
            <img src="/favicon.svg" alt="AgentRAG" className="w-8 h-8 brightness-0 invert" />
          </div>
          <h2 className="text-xl font-semibold text-[#3d3530] mb-2">Welcome to AgentRAG</h2>
          <p className="text-sm text-[#9e8b78] max-w-md">
            Your intelligent document assistant — upload files, ask questions, get answers grounded in your knowledge base.
          </p>
          <button
            onClick={onCreateThread}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            Start a new conversation
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full">
          {features.map((f, i) => (
            <FeatureCard key={i} {...f} />
          ))}
        </div>
      </div>

      {/* CSS for floating animation */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -20px) scale(1.05); }
          50% { transform: translate(-10px, -40px) scale(0.95); }
          75% { transform: translate(-20px, -10px) scale(1.02); }
        }
      `}</style>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  action,
  link,
  bg,
  color,
}: {
  icon: typeof FileText
  title: string
  desc: string
  action: string
  link?: string
  bg: string
  color: string
}) {
  const content = (
    <div className={`group rounded-2xl border p-4 ${bg} hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 cursor-pointer`}>
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br ${color} mb-3`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <h3 className="text-sm font-semibold text-[#3d3530] mb-1">{title}</h3>
      <p className="text-xs text-[#9e8b78] leading-relaxed mb-3">{desc}</p>
      <p className="text-xs font-medium text-[#e8954c] group-hover:text-[#d4704a] transition-colors">
        {action} →
      </p>
    </div>
  )

  if (link) {
    return <Link to={link}>{content}</Link>
  }
  return content
}
