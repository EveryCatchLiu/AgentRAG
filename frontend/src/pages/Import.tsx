import { useState, useCallback, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { Upload, Trash2, Loader2, FileText, CheckCircle2, XCircle, MessageSquare, Info } from "lucide-react"

interface FileItem {
  id: string
  filename: string
  status: "pending" | "processing" | "done" | "error" | "outdated"
  total_chunks: number
  created_at: string
}

interface FileDetail extends FileItem {
  size_bytes: number
  content_hash: string
  storage_path: string
  metadata: {
    title?: string
    author?: string
    topics?: string[]
    document_type?: string
    language?: string
    summary?: string
  } | null
  updated_at: string
}

interface UploadProgress {
  filename: string
  status: "uploading" | "done" | "skipped" | "updated" | "error"
  error?: string
}

export default function Import() {
  const { user } = useAuth()
  const [files, setFiles] = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    loadFiles()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    const hasPending = files.some(f => f.status === "pending" || f.status === "processing")
    if (hasPending) {
      pollRef.current = window.setInterval(loadFiles, 2000)
    } else if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [files])

  const loadFiles = useCallback(async () => {
    if (!user) return
    const res = await fetch(`/api/files?user_id=${user.id}`)
    const data: FileItem[] = await res.json()
    setFiles(data)
  }, [user])

  const uploadFiles = useCallback(async (fileList: File[]) => {
    if (!user || fileList.length === 0) return

    setUploading(true)
    const progress: UploadProgress[] = fileList.map(f => ({
      filename: f.name,
      status: "uploading" as const,
    }))
    setUploadProgress(progress)

    // Upload in parallel batches of 4
    const BATCH_SIZE = 4
    const results: UploadProgress[] = []

    for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
      const batch = fileList.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          const formData = new FormData()
          formData.append("file", file)
          try {
            const res = await fetch(`/api/files/upload?user_id=${user.id}`, {
              method: "POST",
              body: formData,
            })
            const data = await res.json()
            if (data.skipped) return { filename: file.name, status: "skipped" as const }
            if (data.updated) return { filename: file.name, status: "updated" as const }
            return { filename: file.name, status: "done" as const }
          } catch (e) {
            return { filename: file.name, status: "error" as const, error: String(e) }
          }
        })
      )
      results.push(...batchResults)

      // Update progress after each batch
      setUploadProgress([...results])
    }

    setUploading(false)
    loadFiles()
    // Clear progress after 3 seconds
    setTimeout(() => setUploadProgress([]), 3000)
  }, [user, loadFiles])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    await uploadFiles(droppedFiles)
  }, [uploadFiles])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const selected = Array.from(e.target.files)
    e.target.value = ""
    await uploadFiles(selected)
  }, [uploadFiles])

  const handleDelete = async (fileId: string) => {
    if (!user) return
    await fetch(`/api/files/${fileId}?user_id=${user.id}`, { method: "DELETE" })
    if (selectedFileId === fileId) {
      setSelectedFileId(null)
      setFileDetail(null)
    }
    loadFiles()
  }

  const handleFileClick = async (fileId: string) => {
    if (!user) return
    if (selectedFileId === fileId) {
      setSelectedFileId(null)
      setFileDetail(null)
      return
    }
    setSelectedFileId(fileId)
    const res = await fetch(`/api/files/${fileId}?user_id=${user.id}`)
    const data: FileDetail = await res.json()
    setFileDetail(data)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <FileText className="h-4 w-4 text-muted-foreground" />
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "outdated":
        return <FileText className="h-4 w-4 text-amber-500" />
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">知识库</h1>
            <p className="text-sm text-muted-foreground">上传文档以构建你的知识库</p>
          </div>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm">对话</span>
          </Link>
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto p-6 ${
          dragging ? "bg-accent/30" : ""
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {/* Upload area */}
        <div className="mx-auto max-w-2xl">
          <label
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer ${
              dragging
                ? "border-[#e8954c] bg-[#fefaf5]"
                : "border-[#e8e0d5] hover:border-[#d4c4b0] hover:bg-[#fdfaf7]"
            }`}
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] mb-3 shadow-sm">
              <Upload className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm font-medium text-[#3d3530] mb-1">
              {uploading ? "正在上传..." : "拖拽文件到此处，或点击选择"}
            </p>
            <p className="text-xs text-[#9e8b78]">
              支持 PDF、Word、图片、Markdown、CSV 等格式 · 可批量上传
            </p>
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md,.csv,.tsv,.html,.htm,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.webp"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>

          {/* Upload progress */}
          {uploadProgress.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#9e8b78]">
                <span>
                  上传进度: {uploadProgress.filter(p => p.status === "done" || p.status === "skipped" || p.status === "updated").length} / {uploadProgress.length}
                </span>
                {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {uploadProgress.map((p, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
                      p.status === "error" ? "bg-red-50 text-red-600" :
                      p.status === "skipped" ? "bg-amber-50 text-amber-600" :
                      p.status === "updated" ? "bg-blue-50 text-blue-600" :
                      p.status === "done" ? "bg-green-50 text-green-600" :
                      "bg-gray-50 text-gray-500"
                    }`}
                  >
                    {p.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                    {p.status === "done" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                    {p.status === "skipped" && <Info className="h-3 w-3 shrink-0" />}
                    {p.status === "updated" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                    {p.status === "error" && <XCircle className="h-3 w-3 shrink-0" />}
                    <span className="truncate flex-1">{p.filename}</span>
                    <span className="shrink-0 text-[10px]">
                      {p.status === "uploading" && "上传中"}
                      {p.status === "done" && "已上传"}
                      {p.status === "skipped" && "已跳过(重复)"}
                      {p.status === "updated" && "已更新"}
                      {p.status === "error" && (p.error || "失败")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File list */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#3d3530]">
                文件列表
                <span className="ml-1.5 text-xs font-normal text-[#b8a48e]">({files.length})</span>
              </h2>
            </div>
            <div className="space-y-2">
              {files.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  还没有上传任何文件
                </p>
              )}
              {files.map((file) => (
                <div key={file.id}>
                  <div
                    className={`group flex items-center justify-between rounded-md border px-4 py-3 transition-colors ${
                      file.status === "done" || file.status === "outdated"
                        ? "cursor-pointer hover:bg-accent/50"
                        : ""
                    } ${selectedFileId === file.id ? "bg-accent border-primary/30" : ""}`}
                    onClick={() => (file.status === "done" || file.status === "outdated") && handleFileClick(file.id)}
                  >
                    <div className="flex items-center gap-3">
                      {statusIcon(file.status)}
                      <div>
                        <p className="text-sm font-medium">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.status === "done" && `${file.total_chunks} 个片段`}
                          {file.status === "processing" && "处理中..."}
                          {file.status === "pending" && "等待处理"}
                          {file.status === "error" && "处理失败 - 可能为扫描版PDF或文件损坏"}
                          {file.status === "outdated" && "需要重新处理 - Embedding 维度已更新"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {file.status === "done" && (
                        <span className="rounded px-1.5 py-0.5 text-xs text-muted-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(file.id)
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* File detail panel */}
      {fileDetail && (
        <div className="border-t p-6 bg-[#fdfaf7]">
          <div className="mx-auto max-w-2xl">
            <h3 className="text-sm font-semibold mb-2">{fileDetail.filename}</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>大小: {formatSize(fileDetail.size_bytes)}</span>
              <span>状态: {fileDetail.status}</span>
              <span>片段数: {fileDetail.total_chunks}</span>
              <span>类型: {fileDetail.metadata?.document_type || "未知"}</span>
              {fileDetail.metadata?.title && <span>标题: {fileDetail.metadata.title}</span>}
              {fileDetail.metadata?.author && <span>作者: {fileDetail.metadata.author}</span>}
              {fileDetail.metadata?.language && <span>语言: {fileDetail.metadata.language}</span>}
            </div>
            {fileDetail.metadata?.topics && fileDetail.metadata.topics.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {fileDetail.metadata.topics.map((t, i) => (
                  <span key={i} className="rounded bg-[#fefaf5] border border-[#f0d8b8] px-2 py-0.5 text-[10px] text-[#8b5e3c]">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {fileDetail.metadata?.summary && (
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {fileDetail.metadata.summary}
              </p>
            )}
            <button
              onClick={() => { setSelectedFileId(null); setFileDetail(null) }}
              className="mt-3 text-xs text-[#8b5e3c] hover:text-[#d4704a] transition-colors"
            >
              收起详情
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
