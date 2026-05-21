import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { Settings as SettingsIcon, MessageSquare, Upload } from "lucide-react"

export default function SettingsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<"llm" | "embedding">("llm")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [llmForm, setLlmForm] = useState({
    llm_api_key: "",
    llm_base_url: "",
    llm_model: "",
    llm_title_model: "",
    llm_system_prompt: "",
  })

  const [embedForm, setEmbedForm] = useState({
    embedding_api_key: "",
    embedding_base_url: "",
    embedding_model: "text-embedding-v3",
    chunk_size: 1000,
    chunk_overlap: 200,
  })

  const loadSettings = useCallback(async () => {
    if (!user) return
    const res = await fetch(`/api/settings?user_id=${user.id}`)
    const data = await res.json()
    if (data.user_id) {
      setLlmForm({
        llm_api_key: data.llm_api_key || "",
        llm_base_url: data.llm_base_url || "",
        llm_model: data.llm_model || "",
        llm_title_model: data.llm_title_model || "",
        llm_system_prompt: data.llm_system_prompt || "",
      })
      setEmbedForm({
        embedding_api_key: data.embedding_api_key || "",
        embedding_base_url: data.embedding_base_url || "",
        embedding_model: data.embedding_model || "text-embedding-v3",
        chunk_size: data.chunk_size || 1000,
        chunk_overlap: data.chunk_overlap || 200,
      })
    }
  }, [user])

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSaveLLM = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)
    await fetch(`/api/settings/llm?user_id=${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(llmForm),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveEmbedding = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)
    await fetch(`/api/settings/embedding?user_id=${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(embedForm),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/chat" className="rounded-lg p-1.5 text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold">Settings</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b px-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("llm")}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "llm"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            LLM
          </button>
          <button
            onClick={() => setActiveTab("embedding")}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "embedding"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Embedding
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "llm" && (
          <div className="mx-auto max-w-xl space-y-6">
            {/* API Key */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">API Key</label>
              <div className="relative">
                <input
                  type="password"
                  value={llmForm.llm_api_key}
                  onChange={(e) => setLlmForm({ ...llmForm, llm_api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Base URL (optional)</label>
              <input
                type="text"
                value={llmForm.llm_base_url}
                onChange={(e) => setLlmForm({ ...llmForm, llm_base_url: e.target.value })}
                placeholder="https://openrouter.ai/api/v1"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Model & Title Model */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Model</label>
                <input
                  type="text"
                  value={llmForm.llm_model}
                  onChange={(e) => setLlmForm({ ...llmForm, llm_model: e.target.value })}
                  placeholder="qwen-plus"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Title Model</label>
                <input
                  type="text"
                  value={llmForm.llm_title_model}
                  onChange={(e) => setLlmForm({ ...llmForm, llm_title_model: e.target.value })}
                  placeholder="qwen-turbo"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* System Prompt */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">System Prompt</label>
              <textarea
                value={llmForm.llm_system_prompt}
                onChange={(e) => setLlmForm({ ...llmForm, llm_system_prompt: e.target.value })}
                placeholder="Enter your system prompt..."
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Save */}
            <button
              onClick={handleSaveLLM}
              disabled={saving}
              className="rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-6 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save LLM Settings"}
            </button>
          </div>
        )}

        {activeTab === "embedding" && (
          <div className="mx-auto max-w-xl space-y-6">
            {/* API Key */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">API Key (empty = use LLM key)</label>
              <input
                type="password"
                value={embedForm.embedding_api_key}
                onChange={(e) => setEmbedForm({ ...embedForm, embedding_api_key: e.target.value })}
                placeholder="sk-..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Base URL */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Base URL (optional)</label>
              <input
                type="text"
                value={embedForm.embedding_base_url}
                onChange={(e) => setEmbedForm({ ...embedForm, embedding_base_url: e.target.value })}
                placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Model */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Model</label>
              <input
                type="text"
                value={embedForm.embedding_model}
                onChange={(e) => setEmbedForm({ ...embedForm, embedding_model: e.target.value })}
                placeholder="text-embedding-v3"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Chunk Size & Overlap */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Chunk Size</label>
                <input
                  type="number"
                  value={embedForm.chunk_size}
                  onChange={(e) => setEmbedForm({ ...embedForm, chunk_size: parseInt(e.target.value) })}
                  placeholder="1000"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Chunk Overlap</label>
                <input
                  type="number"
                  value={embedForm.chunk_overlap}
                  onChange={(e) => setEmbedForm({ ...embedForm, chunk_overlap: parseInt(e.target.value) })}
                  placeholder="200"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleSaveEmbedding}
              disabled={saving}
              className="rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-6 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Embedding Settings"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
