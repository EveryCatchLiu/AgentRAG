import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { useChatStore, type Message, type Source, type ToolCall, type Decomposition, type Subtask, type MediaAttachment } from "../lib/store"
import { Plus, Trash2, Loader2, FolderInput, Settings, Image, X } from "lucide-react"
import SourceList from "../components/SourceCard"
import ToolCallCard from "../components/ToolCallCard"
import ReasoningPanel from "../components/ReasoningPanel"
import MarkdownMessage from "../components/MarkdownMessage"
import DecompositionCard from "../components/DecompositionCard"
import WelcomeScreen from "../components/WelcomeScreen"
import FilterBar from "../components/FilterBar"

export default function Chat() {
  const { user, signOut } = useAuth()
  const {
    threads,
    currentThread,
    messages,
    streaming,
    filterFileIds,
    filterTopics,
    loadThreads,
    loadMessages,
    createThread,
    selectThread,
    deleteThread,
    addMessage,
    setStreaming,
  } = useChatStore()
  const [input, setInput] = useState("")
  const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) loadThreads(user.id)
  }, [user])

  useEffect(() => {
    if (currentThread && user) {
      loadMessages(currentThread.id, user.id)
    }
  }, [currentThread?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !currentThread || !user) return

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      media: mediaAttachments.length > 0 ? [...mediaAttachments] : undefined,
    }
    addMessage(userMessage)
    setInput("")
    setMediaAttachments([])
    setError(null)
    setStreaming(true)

    const assistantMessage: Message = { role: "assistant", content: "" }
    addMessage(assistantMessage)
    // Use getState() for real-time length, not closure's stale messages
    const assistantIndex = useChatStore.getState().messages.length - 1
    let timeout: ReturnType<typeof setTimeout> | null = null

    try {
      const response = await fetch(
        `/api/threads/${currentThread.id}/messages?user_id=${user.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: userMessage.content,
            media: userMessage.media?.map((m) => ({ type: m.type, data: m.data })),
            filter_file_ids: filterFileIds.length > 0 ? filterFileIds : undefined,
            filter_topics: filterTopics.length > 0 ? filterTopics : undefined,
          }),
        }
      )

      const reader = response.body?.getReader()
      if (!reader) {
        setStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let fullText = ""
      let currentEvent = ""
      let streamDone = false

      // Safety timeout: stop streaming after 120s no matter what
      timeout = setTimeout(() => {
        streamDone = true
        try { reader.cancel() } catch (_) { /* ignore */ }
      }, 120000)

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")
        for (const line of lines) {
          // SSE event boundary — reset event type
          if (line === "" || line === "\r") {
            currentEvent = ""
            continue
          }
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith("data: ")) {
            const data = line.slice(6)

            // Handle done event — stop the outer while loop
            if (currentEvent === "done") {
              streamDone = true
              break
            } else if (currentEvent === "sources") {
              const sources: Source[] = JSON.parse(data)
              setSourcesAt(assistantIndex, sources)
            } else if (currentEvent === "retrieved_images") {
              const images: string[] = JSON.parse(data)
              setRetrievedImagesAt(assistantIndex, images)
            } else if (currentEvent === "tool_calls") {
              const toolCalls: ToolCall[] = JSON.parse(data)
              setToolCallsAt(assistantIndex, toolCalls)
            } else if (currentEvent === "error") {
              try {
                const errData = JSON.parse(data)
                setError(errData.message || data)
              } catch {
                setError(data)
              }
              console.error("SSE error:", data)
            } else if (currentEvent === "reasoning") {
              const reasoning: string[] = JSON.parse(data)
              setReasoningAt(assistantIndex, reasoning)
            } else if (currentEvent === "decomposition") {
              const data_obj = JSON.parse(data)
              const decomposition: Decomposition = {
                analysis: data_obj.analysis || "",
                subtasks: (data_obj.subtasks || []).map((s: Record<string, unknown>) => ({
                  id: s.id as string,
                  description: s.description as string,
                  depends_on: (s.depends_on as string[]) || [],
                  status: "pending" as const,
                })),
              }
              setDecompositionAt(assistantIndex, decomposition)
            } else if (currentEvent === "subtask_start") {
              const data_obj = JSON.parse(data)
              updateSubtaskAt(assistantIndex, data_obj.task_id, "running")
            } else if (currentEvent === "subtask_done") {
              const data_obj = JSON.parse(data)
              updateSubtaskAt(assistantIndex, data_obj.task_id, "done", data_obj.answer)
            } else if (currentEvent === "subtask_error") {
              const data_obj = JSON.parse(data)
              updateSubtaskAt(assistantIndex, data_obj.task_id, "error", undefined, data_obj.error)
            } else if (data !== "end") {
              fullText += data
              setMessagesAt(assistantIndex, fullText)
            }
          }
        }
      }

    } catch (err) {
      console.error("Failed to send message:", err)
    }

    clearTimeout(timeout)
    setStreaming(false)
  }

  const setMessagesAt = (index: number, text: string) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], content: text }
    store.setMessages(updated)
  }

  const setSourcesAt = (index: number, sources: Source[]) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], sources }
    store.setMessages(updated)
  }

  const setRetrievedImagesAt = (index: number, images: string[]) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], retrievedImages: images }
    store.setMessages(updated)
  }

  const setToolCallsAt = (index: number, toolCalls: ToolCall[]) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], toolCalls }
    store.setMessages(updated)
  }

  const setReasoningAt = (index: number, reasoning: string[]) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    const existing = updated[index].reasoning || []
    updated[index] = { ...updated[index], reasoning: [...existing, ...reasoning] }
    store.setMessages(updated)
  }

  const setDecompositionAt = (index: number, decomposition: Decomposition) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], decomposition }
    store.setMessages(updated)
  }

  const updateSubtaskAt = (index: number, taskId: string, status: Subtask["status"], answer?: string, error?: string) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    const msg = updated[index]
    if (msg.decomposition) {
      const subtasks = msg.decomposition.subtasks.map(s =>
        s.id === taskId ? { ...s, status, ...(answer ? { answer } : {}), ...(error ? { error } : {}) } : s
      )
      updated[index] = { ...msg, decomposition: { ...msg.decomposition, subtasks } }
      store.setMessages(updated)
    }
  }

  const handleNewThread = () => {
    if (!user) return
    createThread(user.id)
  }

  const handleDeleteThread = async (threadId: string) => {
    if (!user) return
    await deleteThread(user.id, threadId)
  }

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith("video/")
      const reader = new FileReader()
      reader.onload = () => {
        const dataUri = reader.result as string
        setMediaAttachments((prev) => [
          ...prev,
          {
            type: isVideo ? "video" : "image",
            data: dataUri,
            previewUrl: URL.createObjectURL(file),
          },
        ])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }

  const removeMedia = (index: number) => {
    setMediaAttachments((prev) => {
      const updated = [...prev]
      if (updated[index].previewUrl) {
        URL.revokeObjectURL(updated[index].previewUrl!)
      }
      updated.splice(index, 1)
      return updated
    })
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-[#e8e0d5] bg-[#f5f1ec]">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="AgentRAG" className="h-6 w-6" />
            <h1 className="font-semibold text-[#3d3530]">AgentRAG</h1>
          </div>
          <div className="flex gap-1">
            <Link to="/import" className="rounded-lg p-1.5 text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c]" title="Import files">
              <FolderInput className="h-4 w-4" />
            </Link>
            <button
              onClick={handleNewThread}
              className="rounded-lg p-1.5 text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c]"
              title="New thread"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={signOut}
              className="rounded-lg p-1.5 text-[#b8a48e] hover:bg-[#fefaf5] hover:text-[#8b5e3c]"
              title="Sign out"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`group mb-1 flex items-center rounded-lg ${
                currentThread?.id === thread.id
                  ? "bg-[#fefaf5] border border-[#f0d8b8] text-[#8b5e3c]"
                  : "text-[#9e8b78] hover:bg-[#fdf9f5]"
              }`}
            >
              <button
                onClick={() => selectThread(thread)}
                className="flex-1 truncate px-3 py-2 text-left text-sm"
              >
                {thread.title}
              </button>
              <button
                onClick={() => handleDeleteThread(thread.id)}
                className="mr-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Bottom nav */}
        <div className="flex border-t border-[#e8e0d5]">
          <Link
            to="/import"
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c]"
          >
            <FolderInput className="h-4 w-4" />
            Import
          </Link>
          <Link
            to="/settings"
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c]"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col">
        {currentThread ? (
          <>
            <FilterBar userId={user.id} />
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-[#f0d0c0] bg-[#fef9f6] px-4 py-3 text-sm text-[#b85c3a]">
                  <div className="flex items-center justify-between gap-2">
                    <span>{error}</span>
                    <button
                      onClick={() => setError(null)}
                      className="shrink-0 rounded p-0.5 hover:bg-destructive/20"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
              )}
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Send a message to start the conversation
                </div>
              ) : (
                <div className="mx-auto max-w-4xl space-y-6">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[90%]`}>
                        {/* Reasoning panel — ABOVE the message bubble */}
                        {msg.role === "assistant" && msg.reasoning && msg.reasoning.length > 0 && (
                          <ReasoningPanel reasoning={msg.reasoning} />
                        )}

                        {/* Decomposition card — ABOVE the message bubble */}
                        {msg.role === "assistant" && msg.decomposition && (
                          <div className="mb-3 w-full">
                            <DecompositionCard decomposition={msg.decomposition} />
                          </div>
                        )}

                        {/* Message bubble */}
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            msg.role === "user"
                              ? "bg-gradient-to-br from-[#e8954c] to-[#d4704a] text-white shadow-sm"
                              : "bg-white border border-[#f0e0c8] shadow-sm"
                          }`}
                          style={
                            msg.role === "user"
                              ? { borderRadius: "14px 14px 4px 14px" }
                              : { borderRadius: "14px 14px 14px 6px" }
                          }
                        >
                          {msg.content ? (
                            msg.role === "assistant" ? (
                              <MarkdownMessage content={msg.content} />
                            ) : (
                              <>
                                <span className="whitespace-pre-wrap">{msg.content}</span>
                                {msg.media && msg.media.length > 0 && (
                                  <div className="mt-2 flex gap-2 flex-wrap">
                                    {msg.media.map((m, i) => (
                                      <div key={i}>
                                        {m.type === "image" ? (
                                          <img
                                            src={m.previewUrl || m.data}
                                            alt="Attached"
                                            className="max-h-48 max-w-[300px] object-cover rounded-lg border border-white/20"
                                          />
                                        ) : (
                                          <video
                                            src={m.previewUrl || m.data}
                                            controls
                                            className="max-h-48 max-w-[300px] rounded-lg border border-white/20"
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </div>

                        {/* Retrieved images from vector DB */}
                        {msg.role === "assistant" && msg.retrievedImages && msg.retrievedImages.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-medium text-[#b8a48e]">
                              检索到的图片 ({msg.retrievedImages.length})
                            </p>
                            <div className="flex gap-2 flex-wrap">
                              {msg.retrievedImages.map((path, i) => (
                                <img
                                  key={i}
                                  src={`/api/images/proxy?path=${encodeURIComponent(path)}`}
                                  alt={`Retrieved ${i + 1}`}
                                  className="max-h-48 max-w-[300px] object-cover rounded-lg border border-[#f0e0c8] cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => {
                                    window.open(`/api/images/proxy?path=${encodeURIComponent(path)}`, "_blank")
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tool calls — BELOW the message bubble */}
                        {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="mt-2 space-y-1 w-full">
                            {msg.toolCalls.map((tc) => (
                              <ToolCallCard key={tc.id} toolCall={tc} />
                            ))}
                          </div>
                        )}

                        {/* Sources — BELOW everything */}
                        {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                          <SourceList sources={msg.sources} />
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Media previews */}
            {mediaAttachments.length > 0 && (
              <div className="mx-auto flex max-w-4xl gap-2 px-4 mb-2 flex-wrap">
                {mediaAttachments.map((m, i) => (
                  <div key={i} className="relative group">
                    {m.type === "image" ? (
                      <img
                        src={m.previewUrl}
                        alt="Preview"
                        className="h-16 w-16 object-cover rounded-lg border border-[#e8e0d5]"
                      />
                    ) : (
                      <video
                        src={m.previewUrl}
                        className="h-16 w-16 object-cover rounded-lg border border-[#e8e0d5]"
                        muted
                      />
                    )}
                    <button
                      onClick={() => removeMedia(i)}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-[#d4704a] p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-[#e8e0d5] p-4">
              <div className="mx-auto flex max-w-4xl gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 rounded-2xl border border-[#e8e0d5] bg-white px-4 py-2.5 text-sm text-[#5c4a3a] placeholder-[#b8a48e] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#e8954c]/30 focus:border-[#e8954c]/40"
                  disabled={streaming}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleMediaSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={streaming}
                  className="rounded-2xl border border-[#e8e0d5] bg-white px-3 py-2.5 text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c] disabled:opacity-50 transition-colors"
                  title="Attach image or video"
                >
                  <Image className="h-5 w-5" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  className="rounded-2xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <WelcomeScreen onCreateThread={handleNewThread} />
        )}
      </main>
    </div>
  )
}
