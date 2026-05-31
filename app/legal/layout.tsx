import type { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "الشروط والسياسات | 7esab.com",
}

const LINKS = [
  { href: "/legal/terms", label: "شروط الاستخدام", labelEn: "Terms of Service" },
  { href: "/legal/privacy", label: "سياسة الخصوصية", labelEn: "Privacy Policy" },
  { href: "/legal/refund", label: "سياسة الاسترداد", labelEn: "Refund Policy" },
]

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-blue-950/30" dir="rtl">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700 dark:text-blue-400">
            7esab.com
          </Link>
          <nav className="hidden gap-6 text-sm md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-slate-600 transition-colors hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-400"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            تسجيل الدخول
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="prose prose-slate max-w-none p-8 dark:prose-invert prose-headings:text-slate-900 dark:prose-headings:text-slate-100 prose-h1:text-3xl prose-h2:mt-8 prose-h2:text-xl prose-h2:font-bold prose-p:leading-relaxed prose-li:my-1">
            {children}
          </CardContent>
        </Card>

        <nav className="mt-6 flex flex-wrap justify-center gap-4 text-sm md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-slate-600 underline-offset-4 hover:text-blue-700 hover:underline dark:text-slate-300"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <p>© {new Date().getFullYear()} 7esab.com — جميع الحقوق محفوظة</p>
        <p className="mt-1">
          للتواصل:{" "}
          <a href="mailto:info@7esab.com" className="text-blue-700 hover:underline dark:text-blue-400">
            info@7esab.com
          </a>
        </p>
      </footer>
    </div>
  )
}
