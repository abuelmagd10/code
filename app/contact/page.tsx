import type { Metadata } from "next"
import Link from "next/link"
import { Mail, MessageCircle } from "lucide-react"
import { ContactForm } from "@/components/contact/ContactForm"

export const metadata: Metadata = {
  title: "تواصل معنا | 7esab.com",
  description: "نموذج الاتصال المباشر مع فريق دعم 7esab.com — نرد خلال يوم عمل واحد.",
}

const SUPPORT_EMAIL = "info@7esab.com"

export default function ContactPage() {
  // WhatsApp number is configured at runtime via env. If not set, the
  // button is hidden — better than a dead button.
  const waNumber = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER || ""
  const waLink = waNumber
    ? `https://wa.me/${waNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("مرحباً، أحتاج مساعدة فى 7esab.com")}`
    : ""

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-blue-950/30" dir="rtl">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700 dark:text-blue-400">
            7esab.com
          </Link>
          <nav className="hidden gap-6 text-sm md:flex">
            <Link href="/legal/terms" className="text-slate-600 hover:text-blue-700 dark:text-slate-300">شروط الاستخدام</Link>
            <Link href="/legal/privacy" className="text-slate-600 hover:text-blue-700 dark:text-slate-300">الخصوصية</Link>
            <Link href="/contact" className="font-semibold text-blue-700 dark:text-blue-400">تواصل معنا</Link>
          </nav>
          <Link href="/auth/login" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            تسجيل الدخول
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-bold text-slate-900 dark:text-slate-100">تواصل معنا</h1>
          <p className="mx-auto max-w-2xl text-slate-600 dark:text-slate-400">
            لديك سؤال، اقتراح، أو تحتاج مساعدة فى استخدام النظام؟ نحن هنا. نرد خلال يوم عمل واحد على الرسائل عبر النموذج، وأسرع عبر WhatsApp.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Email card */}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              <Mail className="h-6 w-6" />
            </div>
            <h2 className="mb-1 font-bold text-slate-900 dark:text-slate-100">بريد إلكترونى</h2>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">للاستفسارات التفصيلية والمرفقات.</p>
            <p className="font-mono text-sm text-blue-700 group-hover:underline dark:text-blue-400">{SUPPORT_EMAIL}</p>
          </a>

          {/* WhatsApp card — only if env configured */}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-green-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h2 className="mb-1 font-bold text-slate-900 dark:text-slate-100">واتساب</h2>
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">للاستفسارات السريعة، أيام العمل من 9 ص حتى 6 م.</p>
              <p className="text-sm text-green-700 group-hover:underline dark:text-green-400">ابدأ المحادثة ←</p>
            </a>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500">
              <MessageCircle className="mx-auto mb-2 h-6 w-6 opacity-40" />
              واتساب الدعم سيتاح قريباً
            </div>
          )}

          {/* Form callout card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            </div>
            <h2 className="mb-1 font-bold text-slate-900 dark:text-slate-100">نموذج تفصيلى</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              املأ النموذج بالأسفل. سنرد على البريد الذى تُسجِّله.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-slate-100">أرسل لنا رسالة</h2>
          <ContactForm supportEmail={SUPPORT_EMAIL} />
        </div>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <p>© {new Date().getFullYear()} 7esab.com — جميع الحقوق محفوظة</p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link href="/legal/terms" className="hover:text-blue-700">الشروط</Link>
          <Link href="/legal/privacy" className="hover:text-blue-700">الخصوصية</Link>
          <Link href="/legal/refund" className="hover:text-blue-700">الاسترداد</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-blue-700">{SUPPORT_EMAIL}</a>
        </p>
      </footer>
    </div>
  )
}
