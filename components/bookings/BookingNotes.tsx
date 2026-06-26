"use client"

/**
 * v3.74.369 — BookingNotes
 *
 * A small notes feed on the booking detail page. Lets the staff who
 * executes the service jot down free-text notes (problems with the
 * machine, the customer asked for X, etc.). Multiple notes per
 * booking, time-stamped, author shown.
 *
 * Backed by /api/bookings/[id]/notes (GET + POST + DELETE).
 */

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Send, Trash2, MessageSquare, User } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"

interface BookingNote {
  id: string
  user_id: string
  body: string
  created_at: string
  author_name?: string | null
  author_email?: string | null
}

interface BookingNotesProps {
  bookingId: string
  lang?: string
  /** Show the input area? Hide for terminal/locked statuses if needed. */
  canAdd?: boolean
}

function fmt(d: string, isAr: boolean): string {
  try {
    return new Date(d).toLocaleString(isAr ? "ar-EG" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return d
  }
}

export function BookingNotes({
  bookingId,
  lang = "ar",
  canAdd = true,
}: BookingNotesProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  const [notes, setNotes]       = useState<BookingNote[]>([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState("")
  const [posting, setPosting]   = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // v3.74.369 fix — bulletproof against the infinite-fetch loop the
  // previous v3.74.368 ship had. We no longer wrap load() in useCallback
  // (which kept re-creating with t/toast deps and re-firing the effect
  // forever — the user saw thousands of ERR_INSUFFICIENT_RESOURCES). The
  // load() function is defined inside the effect with a cancelled flag
  // so React unmounting can't double-fire, and the only dep is
  // bookingId. Refs hold the latest toast/isAr so the closure doesn't
  // need them as deps either.
  const toastRef = useRef(toast)
  const isArRef  = useRef(isAr)
  useEffect(() => { toastRef.current = toast }, [toast])
  useEffect(() => { isArRef.current = isAr }, [isAr])

  // Standalone reload used by the post/delete handlers below.
  const reload = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/bookings/${bookingId}/notes`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to load notes")
      setNotes(json.notes ?? [])
    } catch (err: any) {
      toastActionError(
        toastRef.current,
        isArRef.current ? "خطأ فى تحميل الملاحظات" : "Failed to load notes",
        err.message,
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/bookings/${bookingId}/notes`, { cache: "no-store" })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(json?.error || "Failed to load notes")
        setNotes(json.notes ?? [])
      } catch (err: any) {
        if (cancelled) return
        toastActionError(
          toastRef.current,
          isArRef.current ? "خطأ فى تحميل الملاحظات" : "Failed to load notes",
          err.message,
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [bookingId])

  const handlePost = async () => {
    const body = text.trim()
    if (!body) return
    setPosting(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to save note")
      setText("")
      await reload()
      toastActionSuccess(toast, t("تمت إضافة الملاحظة", "Note added"))
    } catch (err: any) {
      toastActionError(toast, t("فشل الحفظ", "Save failed"), err.message)
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("حذف هذه الملاحظة؟", "Delete this note?"))) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/notes?note_id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to delete")
      setNotes((prev) => prev.filter((n) => n.id !== id))
      toastActionSuccess(toast, t("تم حذف الملاحظة", "Note deleted"))
    } catch (err: any) {
      toastActionError(toast, t("فشل الحذف", "Delete failed"), err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      {/* Input area */}
      {canAdd && (
        <div className="space-y-2 rounded-lg border border-dashed p-3 bg-card">
          <label className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            {t("إضافة ملاحظة", "Add a note")}
          </label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t(
              "اكتب الملاحظة هنا — مثلاً تفاصيل أثناء تنفيذ الخدمة أو طلب خاص للعميل…",
              "Type the note here — e.g. details during the service or a special request from the customer…",
            )}
            disabled={posting}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handlePost}
              disabled={posting || !text.trim()}
            >
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("إرسال", "Send")}
            </Button>
          </div>
        </div>
      )}

      {/* Notes feed */}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("جارٍ التحميل...", "Loading...")}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-center py-6 text-muted-foreground text-sm">
          {t("لا توجد ملاحظات بعد", "No notes yet")}
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border p-3 bg-card relative"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-[10px] font-semibold">
                    {(n.author_name ?? n.author_email ?? "?")[0]?.toUpperCase()}
                  </div>
                  <span className="font-medium text-foreground">
                    {n.author_name || n.author_email || (
                      <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />?</span>
                    )}
                  </span>
                  <span>· {fmt(n.created_at, isAr)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  title={t("حذف", "Delete")}
                >
                  {deletingId === n.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
