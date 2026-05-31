"use client"

import { useState } from "react"
import { Loader2, Send, CheckCircle2, XCircle } from "lucide-react"

interface Props { supportEmail: string }

type Status =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success" }
  | { state: "error"; message: string }

export function ContactForm({ supportEmail }: Props) {
  const [status, setStatus] = useState<Status>({ state: "idle" })
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  // Honeypot — bots will fill it; humans will not (it is hidden via CSS).
  const [website, setWebsite] = useState("")

  // Client-side validation that mirrors the API rules. Server is the source
  // of truth — this is just to give the user instant feedback.
  function clientValidate(): string | null {
    if (name.trim().length < 2 || name.trim().length > 80) return "الاسم يجب أن يكون بين 2 و 80 حرفاً"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "البريد الإلكترونى غير صالح"
    if (subject.trim().length < 3 || subject.trim().length > 120) return "الموضوع يجب أن يكون بين 3 و 120 حرفاً"
    if (message.trim().length < 10 || message.trim().length > 2000) return "الرسالة يجب أن تكون بين 10 و 2000 حرف"
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clientError = clientValidate()
    if (clientError) {
      setStatus({ state: "error", message: clientError })
      return
    }
    setStatus({ state: "submitting" })
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim(), website }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus({ state: "error", message: data.error || "تعذَّر إرسال الرسالة. حاول لاحقاً." })
        return
      }
      setStatus({ state: "success" })
      setName(""); setEmail(""); setSubject(""); setMessage("")
    } catch {
      setStatus({ state: "error", message: "خطأ فى الاتصال. تأكد من الإنترنت وحاول مرة أخرى." })
    }
  }

  if (status.state === "success") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center dark:border-green-900 dark:bg-green-900/20">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600 dark:text-green-400" />
        <h3 className="mb-2 text-lg font-bold text-green-900 dark:text-green-200">تم استلام رسالتك</h3>
        <p className="mb-1 text-sm text-green-800 dark:text-green-300">
          سنرد على بريدك خلال يوم عمل واحد. تحقَّق من صندوق الـ junk إذا لم يصلك ردُّنا.
        </p>
        <p className="mt-4 text-xs text-green-700 dark:text-green-400">
          للأمور العاجلة: <a href={`mailto:${supportEmail}`} className="font-mono underline">{supportEmail}</a>
        </p>
        <button
          type="button"
          onClick={() => setStatus({ state: "idle" })}
          className="mt-6 text-sm text-green-700 underline hover:text-green-900 dark:text-green-400"
        >
          إرسال رسالة أخرى
        </button>
      </div>
    )
  }

  const submitting = status.state === "submitting"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot — visually hidden but discoverable by bots */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}>
        <label>اترك هذا الحقل فارغاً <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            الاسم <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="اسمك الكريم"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            البريد الإلكترونى <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            maxLength={200}
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={submitting}
            dir="ltr"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="subject" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          الموضوع <span className="text-red-500">*</span>
        </label>
        <input
          id="subject"
          type="text"
          required
          minLength={3}
          maxLength={120}
          value={subject}
          onChange={e => setSubject(e.target.value)}
          disabled={submitting}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="موضوع رسالتك"
        />
      </div>

      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          الرسالة <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          required
          minLength={10}
          maxLength={2000}
          rows={6}
          value={message}
          onChange={e => setMessage(e.target.value)}
          disabled={submitting}
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="اكتب رسالتك بالتفصيل — ما الذى تحتاج مساعدة فيه؟"
        />
        <p className="mt-1 text-xs text-slate-500">{message.length} / 2000</p>
      </div>

      {status.state === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
          <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-200">{status.message}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          بإرسال هذه الرسالة، أنت تَقبل <a href="/legal/privacy" className="text-blue-600 underline">سياسة الخصوصية</a>.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? "جارٍ الإرسال..." : "إرسال الرسالة"}
        </button>
      </div>
    </form>
  )
}
