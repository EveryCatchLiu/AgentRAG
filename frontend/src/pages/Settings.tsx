import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { Settings as SettingsIcon, MessageSquare, Upload } from "lucide-react"

export default function SettingsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<"llm" | "embedding" | "retrieval" | "tools">("llm")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [llmForm, setLlmForm] = useState({
    llm_api_key: "",
    llm_base_url: "",
    llm_model: "",
    llm_multimodal_model: "",
    bailian_api_key: "",
    bailian_base_url: "",
    llm_title_model: "",
    llm_system_prompt: "",
  })

  const [embedForm, setEmbedForm] = useState({
    embedding_api_key: "",
    embedding_base_url: "",
    embedding_model: "qwen3-vl-embedding",
    chunk_size: 1000,
    chunk_overlap: 200,
  })

  const [retrievalForm, setRetrievalForm] = useState({
    retrieval_method: "hybrid" as "hybrid" | "vector" | "keyword",
    enable_reranker: false,
    reranker_type: "cohere" as "cohere" | "openai",
    reranker_api_key: "",
    reranker_base_url: "",
    reranker_model: "",
  })

  const [toolsForm, setToolsForm] = useState({
    tavily_api_key: "",
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
        llm_multimodal_model: data.llm_multimodal_model || "",
        bailian_api_key: data.bailian_api_key || "",
        bailian_base_url: data.bailian_base_url || "",
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
      setRetrievalForm({
        retrieval_method: data.retrieval_method || "hybrid",
        enable_reranker: data.enable_reranker || false,
        reranker_type: data.reranker_type || "cohere",
        reranker_api_key: data.reranker_api_key || "",
        reranker_base_url: data.reranker_base_url || "",
        reranker_model: data.reranker_model || "",
      })
      setToolsForm({
        tavily_api_key: data.tavily_api_key || "",
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

  const handleSaveRetrieval = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)
    await fetch(`/api/settings/retrieval?user_id=${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(retrievalForm),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveTools = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)
    await fetch(`/api/settings/tools?user_id=${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toolsForm),
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
          <button
            onClick={() => setActiveTab("retrieval")}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "retrieval"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Retrieval
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "tools"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Tools
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
                  placeholder="deepseek-v4-flash"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Multimodal Model</label>
                <input
                  type="text"
                  value={llmForm.llm_multimodal_model}
                  onChange={(e) => setLlmForm({ ...llmForm, llm_multimodal_model: e.target.value })}
                  placeholder="qwen3-vl"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-selected when images/videos are attached
                </p>
              </div>
            </div>

            {/* Bailian API Key & Base URL */}
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-muted-foreground">Bailian Platform (Multimodal)</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Bailian API Key</label>
                  <input
                    type="password"
                    value={llmForm.bailian_api_key}
                    onChange={(e) => setLlmForm({ ...llmForm, bailian_api_key: e.target.value })}
                    placeholder="sk-..."
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Bailian Base URL</label>
                  <input
                    type="text"
                    value={llmForm.bailian_base_url}
                    onChange={(e) => setLlmForm({ ...llmForm, bailian_base_url: e.target.value })}
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            {/* Title Model */}
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

        {activeTab === "retrieval" && (
          <div className="mx-auto max-w-xl space-y-6">
            {/* Retrieval Method */}
            <div>
              <label className="mb-3 block text-sm font-medium">Retrieval Method</label>
              <div className="space-y-2">
                {[
                  { value: "hybrid", label: "Hybrid (Vector + Keyword)", desc: "Best recall — combines semantic and keyword search with RRF fusion" },
                  { value: "vector", label: "Vector only", desc: "Semantic similarity search via embeddings" },
                  { value: "keyword", label: "Keyword only", desc: "Text-based matching via pg_trgm" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      retrievalForm.retrieval_method === opt.value
                        ? "border-[#e8954c] bg-[#fefaf5]"
                        : "border-border hover:bg-[#fefaf5]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="retrieval_method"
                      value={opt.value}
                      checked={retrievalForm.retrieval_method === opt.value}
                      onChange={(e) =>
                        setRetrievalForm({
                          ...retrievalForm,
                          retrieval_method: e.target.value as "hybrid" | "vector" | "keyword",
                        })
                      }
                      className="mt-0.5 accent-[#e8954c]"
                    />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Divider */}
            <hr className="border-border" />

            {/* Enable Reranker */}
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Enable Reranker</label>
                  <p className="text-xs text-muted-foreground">
                    Use a dedicated reranker API to re-score and re-rank retrieved chunks
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={retrievalForm.enable_reranker}
                  onClick={() =>
                    setRetrievalForm({
                      ...retrievalForm,
                      enable_reranker: !retrievalForm.enable_reranker,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#e8954c] focus:ring-offset-2 ${
                    retrievalForm.enable_reranker ? "bg-[#e8954c]" : "bg-[#d4c8b8]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${
                      retrievalForm.enable_reranker ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Reranker API Config (collapsible) */}
            {retrievalForm.enable_reranker && (
              <div className="space-y-4 rounded-lg border border-border bg-[#fefaf5] p-4">
                {/* Reranker Type */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Reranker Type</label>
                  <select
                    value={retrievalForm.reranker_type}
                    onChange={(e) => {
                      const val = e.target.value as "cohere" | "openai"
                      const defaults =
                        val === "cohere"
                          ? { reranker_base_url: "https://api.cohere.com/v2", reranker_model: "rerank-v3.5" }
                          : { reranker_base_url: "", reranker_model: "" }
                      setRetrievalForm({ ...retrievalForm, reranker_type: val, ...defaults })
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="cohere">Cohere (Native API)</option>
                    <option value="openai">OpenAI Compatible</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {retrievalForm.reranker_type === "cohere"
                      ? "Calls Cohere POST /v2/rerank with query + documents"
                      : "Uses Chat Completions prompt-based scoring"}
                  </p>
                </div>

                {/* API Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Reranker API Key</label>
                  <input
                    type="password"
                    value={retrievalForm.reranker_api_key}
                    onChange={(e) => setRetrievalForm({ ...retrievalForm, reranker_api_key: e.target.value })}
                    placeholder="sk-... or Cohere API key"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Base URL */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Base URL</label>
                  <input
                    type="text"
                    value={retrievalForm.reranker_base_url}
                    onChange={(e) => setRetrievalForm({ ...retrievalForm, reranker_base_url: e.target.value })}
                    placeholder={retrievalForm.reranker_type === "cohere" ? "https://api.cohere.com/v2" : "https://api.openai.com/v1"}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Model</label>
                  <input
                    type="text"
                    value={retrievalForm.reranker_model}
                    onChange={(e) => setRetrievalForm({ ...retrievalForm, reranker_model: e.target.value })}
                    placeholder={retrievalForm.reranker_type === "cohere" ? "rerank-v3.5" : "gpt-4o-mini"}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {/* Save */}
            <button
              onClick={handleSaveRetrieval}
              disabled={saving}
              className="rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-6 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Retrieval Settings"}
            </button>
          </div>
        )}

        {activeTab === "tools" && (
          <div className="mx-auto max-w-xl space-y-6">
            <div className="rounded-lg border border-[#e8954c] bg-[#fefaf5] p-4">
              <p className="text-sm text-[#8b5e3c]">
                Configure third-party API keys for the agent's tools. These replace the built-in fallback search methods.
              </p>
            </div>

            {/* Tavily Search API */}
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <label className="text-sm font-medium">Tavily Search API Key</label>
                  <span className="rounded bg-[#e8954c]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#e8954c]">Web Search</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Replaces DuckDuckGo with Tavily's AI-optimized search API for more accurate, real-time web results.
                </p>
                <input
                  type="password"
                  value={toolsForm.tavily_api_key}
                  onChange={(e) => setToolsForm({ ...toolsForm, tavily_api_key: e.target.value })}
                  placeholder="tvly-dev-... (default key configured)"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Get your key at{" "}
                  <a href="https://app.tavily.com" target="_blank" rel="noreferrer" className="text-[#e8954c] hover:underline">
                    app.tavily.com
                  </a>
                </p>
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleSaveTools}
              disabled={saving}
              className="rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-6 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Tools Settings"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
