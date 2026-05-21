import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { useChatStore, type Message, type Source, type ToolCall } from "../lib/store"
import { Plus, Trash2, Loader2, FolderInput, Settings } from "lucide-react"
import SourceList from "../components/SourceCard"
import ToolCallCard from "../components/ToolCallCard"
import ReasoningPanel from "../components/ReasoningPanel"
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

    const userMessage: Message = { role: "user", content: input.trim() }
    addMessage(userMessage)
    setInput("")
    setError(null)
    setStreaming(true)

    const assistantMessage: Message = { role: "assistant", content: "" }
    addMessage(assistantMessage)
    const assistantIndex = messages.length + 1

    try {
      const response = await fetch(
        `/api/threads/${currentThread.id}/messages?user_id=${user.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: userMessage.content,
            filter_file_ids: filterFileIds.length > 0 ? filterFileIds : undefined,
            filter_topics: filterTopics.length > 0 ? filterTopics : undefined,
          }),
        }
      )

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let fullText = ""
      let currentEvent = ""

      while (true) {
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

            if (currentEvent === "sources") {
              const sources: Source[] = JSON.parse(data)
              setSourcesAt(assistantIndex, sources)
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
            } else if (data !== "end") {
              fullText += data
              setMessagesAt(assistantIndex, fullText)
            }
          }
        }
      }

      loadMessages(currentThread.id, user.id)
    } catch (err) {
      console.error("Failed to send message:", err)
    }

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

  const setToolCallsAt = (index: number, toolCalls: ToolCall[]) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], toolCalls }
    store.setMessages(updated)
  }

  const setReasoningAt = (index: number, reasoning: string[]) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], reasoning }
    store.setMessages(updated)
  }

  const handleNewThread = () => {
    if (!user) return
    createThread(user.id)
  }

  const handleDeleteThread = async (threadId: string) => {
    if (!user) return
    await deleteThread(user.id, threadId)
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-muted/30">
        <div className="flex items-center justify-between p-4">
          <h1 className="font-semibold">AgentRAG</h1>
          <div className="flex gap-1">
            <Link to="/import" className="rounded-md p-1.5 hover:bg-accent" title="Import files">
              <FolderInput className="h-4 w-4" />
            </Link>
            <button
              onClick={handleNewThread}
              className="rounded-md p-1.5 hover:bg-accent"
              title="New thread"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={signOut}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
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
              className={`group mb-1 flex items-center rounded-md ${
                currentThread?.id === thread.id
                  ? "bg-accent"
                  : "hover:bg-accent/50"
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
        <div className="flex border-t">
          <Link
            to="/import"
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:bg-accent"
          >
            <FolderInput className="h-4 w-4" />
            Import
          </Link>
          <Link
            to="/settings"
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:bg-accent"
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
                <div className="mx-auto mb-4 max-w-2xl rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
                <div className="mx-auto max-w-2xl space-y-6">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.content || (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                      {msg.role === "assistant" && msg.reasoning && msg.reasoning.length > 0 && (
                        <ReasoningPanel reasoning={msg.reasoning} />
                      )}
                      {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.toolCalls.map((tc) => (
                            <ToolCallCard key={tc.id} toolCall={tc} />
                          ))}
                        </div>
                      )}
                      {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                        <SourceList sources={msg.sources} />
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="border-t p-4">
              <div className="mx-auto flex max-w-2xl gap-2">
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
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={streaming}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Select a thread or create a new one
          </div>
        )}
      </main>
    </div>
  )
}
