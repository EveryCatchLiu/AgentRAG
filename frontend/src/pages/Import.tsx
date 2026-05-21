import { useState, useCallback, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { Upload, Trash2, Loader2, FileText, CheckCircle2, XCircle, MessageSquare, Info } from "lucide-react"

interface FileItem {
  id: string
  filename: string
  status: "pending" | "processing" | "done" | "error"
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

export default function Import() {
  const { user } = useAuth()
  const [files, setFiles] = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [skippedFiles, setSkippedFiles] = useState<string[]>([])
  const [updatedFiles, setUpdatedFiles] = useState<string[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    loadFiles()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Poll while any file is processing
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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!user) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    setUploading(true)

    const localSkipped: string[] = []
    const localUpdated: string[] = []

    for (const file of droppedFiles) {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/files/upload?user_id=${user.id}`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (data.skipped) localSkipped.push(file.name)
      else if (data.updated) localUpdated.push(file.name)
    }

    if (localSkipped.length > 0) {
      setSkippedFiles(localSkipped)
      setTimeout(() => setSkippedFiles([]), 4000)
    }
    if (localUpdated.length > 0) {
      setUpdatedFiles(localUpdated)
      setTimeout(() => setUpdatedFiles([]), 4000)
    }

    setUploading(false)
    loadFiles()
  }, [user, loadFiles])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files) return
    setUploading(true)

    const localSkipped: string[] = []
    const localUpdated: string[] = []

    for (const file of Array.from(e.target.files)) {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/files/upload?user_id=${user.id}`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (data.skipped) localSkipped.push(file.name)
      else if (data.updated) localUpdated.push(file.name)
    }

    if (localSkipped.length > 0) {
      setSkippedFiles(localSkipped)
      setTimeout(() => setSkippedFiles([]), 4000)
    }
    if (localUpdated.length > 0) {
      setUpdatedFiles(localUpdated)
      setTimeout(() => setUpdatedFiles([]), 4000)
    }

    setUploading(false)
    loadFiles()
  }, [user, loadFiles])

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
    const detail: FileDetail = await res.json()
    setFileDetail(detail)
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
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">文件导入</h1>
            <p className="text-sm text-muted-foreground">上传文档以构建你的知识库</p>
          </div>
          <Link to="/chat" className="rounded-md p-2 hover:bg-accent" title="Chat">
            <MessageSquare className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mb-8 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50"
          }`}
        >
          <Upload className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <p className="mb-2 text-sm font-medium">拖放文件到这里，或</p>
          <label className="cursor-pointer text-sm text-primary hover:underline">
            选择文件
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.docx,.doc,.html,.htm,.md,.txt,.csv,.tsv"
              onChange={handleFileSelect}
            />
          </label>
          {uploading && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              上传中...
            </div>
          )}
        </div>

        {/* Skipped notification */}
        {skippedFiles.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#f0d8b8] bg-[#fefaf5] px-4 py-3 text-sm text-[#8b5e3c]">
            Skipped {skippedFiles.length} duplicate file(s): {skippedFiles.join(", ")}
          </div>
        )}

        {/* Updated notification */}
        {updatedFiles.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#d0d0e0] bg-[#f8f8fc] px-4 py-3 text-sm text-[#5a5a80]">
            Updating {updatedFiles.length} file(s): {updatedFiles.join(", ")}
          </div>
        )}

        {/* File list */}
        <div className="space-y-2">
          {files.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              还没有上传任何文件
            </p>
          )}
          {files.map((file) => (
            <div key={file.id}>
              <div
                className={`flex items-center justify-between rounded-md border px-4 py-3 transition-colors ${
                  file.status === "done"
                    ? "cursor-pointer hover:bg-accent/50"
                    : ""
                } ${selectedFileId === file.id ? "bg-accent border-primary/30" : ""}`}
                onClick={() => file.status === "done" && handleFileClick(file.id)}
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
                    onClick={(e) => { e.stopPropagation(); handleDelete(file.id) }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Metadata detail panel */}
              {selectedFileId === file.id && fileDetail && (
                <div className="mt-1 rounded-md border bg-muted/30 px-4 py-3">
                  {fileDetail.metadata ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      {fileDetail.metadata.title && (
                        <div className="col-span-2">
                          <span className="text-xs text-muted-foreground">Title</span>
                          <p className="font-medium">{fileDetail.metadata.title}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-muted-foreground">Size</span>
                        <p>{(fileDetail.size_bytes / 1024).toFixed(1)} KB</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Chunks</span>
                        <p>{fileDetail.total_chunks}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Type</span>
                        <p className="capitalize">{fileDetail.metadata.document_type || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Language</span>
                        <p>{fileDetail.metadata.language || "-"}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground">Hash</span>
                        <p className="font-mono text-xs truncate">{fileDetail.content_hash || "-"}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground">Updated</span>
                        <p className="text-xs">{new Date(fileDetail.updated_at).toLocaleString()}</p>
                      </div>
                      {fileDetail.metadata.topics && fileDetail.metadata.topics.length > 0 && (
                        <div className="col-span-2">
                          <span className="text-xs text-muted-foreground">Topics</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {fileDetail.metadata.topics.map((t) => (
                              <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {fileDetail.metadata.summary && (
                        <div className="col-span-2">
                          <span className="text-xs text-muted-foreground">Summary</span>
                          <p className="text-xs leading-relaxed">{fileDetail.metadata.summary}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Metadata not yet extracted for this file.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
