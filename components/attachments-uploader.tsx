"use client"

/**
 * v3.74.496 — Reusable attachments uploader
 * - Client-side image compression (canvas → WebP, no external deps)
 * - Used by: Products/Services form (max 3 images) and New Expense page (images/PDF receipts)
 */

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, FileText, Loader2 } from "lucide-react"
import type { SupabaseClient } from "@supabase/supabase-js"

export type AttachmentItem = {
  /** Local unique id (existing url or generated) */
  id: string
  /** Pending file not yet uploaded */
  file?: File
  /** Object URL or existing public/signed URL for preview */
  previewUrl?: string
  /** Final public URL (public buckets) */
  url?: string
  /** Storage path inside the bucket (private buckets) */
  path?: string
  name: string
  mime: string
  size?: number
}

/** Compress an image in the browser: resize to maxDim and convert to WebP. Falls back to original on failure. */
export async function compressImageFile(file: File, maxDim = 1200, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality))
    if (!blob || blob.size >= file.size) return file
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image"
    return new File([blob], `${baseName}.webp`, { type: "image/webp" })
  } catch {
    return file
  }
}

/**
 * Upload pending items (those with `file`) to the given bucket under `folder/` (folder = company_id for RLS).
 * Returns all items with `path` + `url` filled. Throws on first upload error.
 */
export async function uploadAttachmentItems(
  supabase: SupabaseClient,
  bucket: string,
  folder: string,
  items: AttachmentItem[]
): Promise<AttachmentItem[]> {
  const results: AttachmentItem[] = []
  for (const item of items) {
    if (!item.file) {
      results.push(item)
      continue
    }
    const ext = item.mime === "application/pdf" ? "pdf" : (item.file.name.split(".").pop() || "webp").toLowerCase()
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, item.file, { contentType: item.mime, upsert: false })
    if (error) throw new Error(error.message || "Upload failed")
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
    results.push({ ...item, file: undefined, path, url: pub?.publicUrl, size: item.file.size })
  }
  return results
}

/** Convert a public URL back to a storage path (for deletion of removed files). */
export function publicUrlToPath(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length))
}

type AttachmentUploaderProps = {
  items: AttachmentItem[]
  onChange: (items: AttachmentItem[]) => void
  maxFiles: number
  /** e.g. "image/webp,image/jpeg,image/png" or with ",application/pdf" */
  accept: string
  /** Max size (MB) for non-image files (PDF). Images are compressed automatically. */
  maxFileSizeMB?: number
  lang?: "ar" | "en"
  disabled?: boolean
}

export function AttachmentUploader({
  items,
  onChange,
  maxFiles,
  accept,
  maxFileSizeMB = 10,
  lang = "ar",
  disabled = false,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const allowPdf = accept.includes("pdf")

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError(null)
    const remaining = maxFiles - items.length
    if (remaining <= 0) return
    const selected = Array.from(fileList).slice(0, remaining)
    setProcessing(true)
    try {
      const newItems: AttachmentItem[] = []
      for (const raw of selected) {
        const isImage = raw.type.startsWith("image/")
        const isPdf = raw.type === "application/pdf"
        if (!isImage && !(allowPdf && isPdf)) {
          setError(lang === "en" ? "Unsupported file type" : "نوع الملف غير مدعوم")
          continue
        }
        let file = raw
        if (isImage) {
          file = await compressImageFile(raw)
        }
        if (file.size > maxFileSizeMB * 1024 * 1024) {
          setError(
            lang === "en"
              ? `File exceeds ${maxFileSizeMB}MB limit: ${raw.name}`
              : `حجم الملف يتجاوز ${maxFileSizeMB} ميجابايت: ${raw.name}`
          )
          continue
        }
        newItems.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
          name: raw.name,
          mime: file.type,
          size: file.size,
        })
      }
      if (newItems.length > 0) onChange([...items, ...newItems])
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const removeItem = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (item?.file && item.previewUrl) {
      try { URL.revokeObjectURL(item.previewUrl) } catch { }
    }
    onChange(items.filter((i) => i.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative w-20 h-20 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 overflow-hidden flex items-center justify-center"
          >
            {item.mime === "application/pdf" ? (
              <div className="flex flex-col items-center gap-1 p-1 text-center">
                <FileText className="w-6 h-6 text-red-500" />
                <span className="text-[9px] leading-tight text-gray-600 dark:text-gray-300 break-all line-clamp-2">
                  {item.name}
                </span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewUrl || item.url}
                alt={item.name || "attachment"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="absolute top-0.5 left-0.5 bg-black/60 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors"
                aria-label={lang === "en" ? "Remove" : "حذف"}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {!disabled && items.length < maxFiles && (
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="w-20 h-20 flex flex-col items-center justify-center gap-1 border-dashed dark:bg-slate-800 dark:border-slate-600"
          >
            {processing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span className="text-[10px]">{lang === "en" ? "Add" : "إضافة"}</span>
              </>
            )}
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {lang === "en"
          ? `${items.length}/${maxFiles} files${allowPdf ? " (images or PDF)" : " (images)"} — images are compressed automatically`
          : `${items.length}/${maxFiles} ملفات${allowPdf ? " (صور أو PDF)" : " (صور)"} — يتم ضغط الصور تلقائياً`}
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={maxFiles > 1}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
