import type { Metadata } from "next"
import Link from "next/link"
import { Calendar, Clock, ArrowLeft } from "lucide-react"
import { getAllPosts } from "@/lib/blog-posts"

export const metadata: Metadata = {
  title: "المدوَّنة — مقالات محاسبية وأدلَّة عملية للشركات المصرية",
  description:
    "مقالات أمينة عن المحاسبة، الضرائب، إدارة الموارد، والـ ERP للشركات الصغيرة والمتوسطة فى مصر. بدون hype — تَجارب حقيقية وأدلَّة عملية.",
  openGraph: {
    title: "مدوَّنة 7esab.com — للشركات المصرية",
    description: "مقالات أمينة وأدلَّة عملية فى المحاسبة والـ ERP.",
    url: "https://7esab.com/blog",
  },
  alternates: { canonical: "https://7esab.com/blog" },
}

export default function BlogIndexPage() {
  const posts = getAllPosts()
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-blue-950/30" dir="rtl">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700 dark:text-blue-400">7esab.com</Link>
          <nav className="hidden gap-6 text-sm md:flex">
            <Link href="/blog" className="font-semibold text-blue-700 dark:text-blue-400">المدوَّنة</Link>
            <Link href="/contact" className="text-slate-600 hover:text-blue-700 dark:text-slate-300">تواصل</Link>
            <Link href="/#pricing" className="text-slate-600 hover:text-blue-700 dark:text-slate-300">الأسعار</Link>
          </nav>
          <Link href="/auth/sign-up" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">جرِّب مجاناً</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10">
          <h1 className="mb-3 text-3xl font-bold text-slate-900 dark:text-slate-100 md:text-4xl">المدوَّنة</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            مقالات أمينة وأدلَّة عملية لأصحاب المنشآت المصرية. لا hype، فقط ما يَنفعك فعلاً فى عملك.
          </p>
        </div>

        <div className="space-y-6">
          {posts.map(post => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(post.publishedAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {post.readingMinutes} دقيقة
                </span>
                {post.tags.slice(0, 2).map(t => (
                  <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {t}
                  </span>
                ))}
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100 md:text-2xl">
                {post.title}
              </h2>
              <p className="mb-3 line-clamp-3 text-slate-600 dark:text-slate-400">{post.excerpt}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 dark:text-blue-400">
                اقرأ المقال <ArrowLeft className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        © {new Date().getFullYear()} 7esab.com • <Link href="/legal/privacy" className="hover:text-blue-700">الخصوصية</Link> • <a href="mailto:info@7esab.com" className="hover:text-blue-700">info@7esab.com</a>
      </footer>
    </div>
  )
}
