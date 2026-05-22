import { create } from "zustand"
import { supabase } from "../lib/supabase"

export interface Thread {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface MediaAttachment {
  type: "image" | "video"
  data: string  // full data URI for images, URL for videos
  previewUrl?: string  // object URL for local preview
}

export interface Source {
  content: string
  similarity: number
  filename: string
  chunk_index: number
  file_id: string
  media_type?: string | null
  media_url?: string | null
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
  result?: string
  status: "running" | "done" | "error"
  children?: ToolCall[]
  reasoning?: string[]
  fileIds?: string[]
  task?: string
}

export interface Subtask {
  id: string
  description: string
  depends_on: string[]
  status: "pending" | "running" | "done" | "error"
  answer?: string
  error?: string
}

export interface Decomposition {
  analysis: string
  subtasks: Subtask[]
}

export interface Message {
  role: "user" | "assistant"
  content: string
  media?: MediaAttachment[]
  retrievedImages?: string[]  // base64 data URIs from vector DB
  sources?: Source[]
  toolCalls?: ToolCall[]
  reasoning?: string[]
  decomposition?: Decomposition
}

interface ChatStore {
  threads: Thread[]
  currentThread: Thread | null
  messages: Message[]
  streaming: boolean
  filterFileIds: string[]
  filterTopics: string[]

  loadThreads: (userId: string) => Promise<void>
  loadMessages: (threadId: string, userId: string) => Promise<void>
  createThread: (userId: string, title?: string) => Promise<Thread>
  selectThread: (thread: Thread) => void
  deleteThread: (userId: string, threadId: string) => Promise<void>
  addMessage: (message: Message) => void
  setMessages: (messages: Message[]) => void
  setStreaming: (streaming: boolean) => void
  setFilterFileIds: (ids: string[]) => void
  setFilterTopics: (topics: string[]) => void
  clearFilters: () => void
  setDecompositionAt: (index: number, decomposition: Decomposition) => void
  updateSubtaskStatus: (index: number, taskId: string, status: Subtask["status"], answer?: string, error?: string) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  threads: [],
  currentThread: null,
  messages: [],
  streaming: false,

  loadThreads: async (userId: string) => {
    const res = await fetch(`/api/threads?user_id=${userId}`)
    const threads: Thread[] = await res.json()
    set({ threads })
  },

  loadMessages: async (threadId: string, userId: string) => {
    const res = await fetch(`/api/threads/${threadId}/messages?user_id=${userId}`)
    const messages: Message[] = await res.json()
    set({ messages })
  },

  createThread: async (userId: string, title?: string) => {
    const res = await fetch(`/api/threads?user_id=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "New Thread" }),
    })
    const thread: Thread = await res.json()
    set((state) => ({
      threads: [thread, ...state.threads],
      currentThread: thread,
      messages: [],
    }))
    return thread
  },

  selectThread: (thread: Thread) => {
    set({ currentThread: thread, messages: [] })
  },

  deleteThread: async (userId: string, threadId: string) => {
    await fetch(`/api/threads/${threadId}?user_id=${userId}`, { method: "DELETE" })
    set((state) => ({
      threads: state.threads.filter((t) => t.id !== threadId),
      currentThread: state.currentThread?.id === threadId ? null : state.currentThread,
      messages: state.currentThread?.id === threadId ? [] : state.messages,
    }))
  },

  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }))
  },

  setMessages: (messages: Message[]) => {
    set({ messages })
  },

  setStreaming: (streaming: boolean) => {
    set({ streaming })
  },

  filterFileIds: [],
  filterTopics: [],
  setFilterFileIds: (ids) => set({ filterFileIds: ids }),
  setFilterTopics: (topics) => set({ filterTopics: topics }),
  clearFilters: () => set({ filterFileIds: [], filterTopics: [] }),

  setDecompositionAt: (index: number, decomposition: Decomposition) => {
    const store = get()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], decomposition }
    set({ messages: updated })
  },

  updateSubtaskStatus: (index: number, taskId: string, status: Subtask["status"], answer?: string, error?: string) => {
    const store = get()
    const updated = [...store.messages]
    const msg = updated[index]
    if (msg.decomposition) {
      const subtasks = msg.decomposition.subtasks.map(s =>
        s.id === taskId ? { ...s, status, ...(answer ? { answer } : {}), ...(error ? { error } : {}) } : s
      )
      updated[index] = { ...msg, decomposition: { ...msg.decomposition, subtasks } }
      set({ messages: updated })
    }
  },
}))
