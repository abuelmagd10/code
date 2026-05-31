import Link from "next/link"
import { ArrowLeft, ArrowRight, Calendar, Clock, Tag } from "lucide-react"
import { getAllPosts, type BlogPost } from "@/lib/blog-posts"

interface Props {
  post: BlogPost
  children: React.ReactNode
}

export function BlogPostLayout({ post, children }: Props) {
  const others = getAllPosts().filter(p => p.slug !== post.slug).slice(0, 2)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-blue-950/30" dir="rtl">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700 dark:text-blue-400">
            7esab.com
          </Link>
          <nav className="hidden gap-6 text-sm md:flex">
            <Link href="/blog" className="text-slate-600 hover:text-blue-700 dark:text-slate-300">المدوَّنة</Link>
            <Link href="/contact" className="text-slate-600 hover:text-blue-700 dark:text-slate-300">تواصل</Link>
            <Link href="/#pricing" className="text-slate-600 hover:text-blue-700 dark:text-slate-300">الأسعار</Link>
          </nav>
          <Link href="/auth/sign-up" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            جرِّب مجاناً
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12">
        {/* Back link */}
        <Link href="/blog" className="mb-6 inline-flex items-center gap-2 text-sm text-blue-700 hover:underline dark:text-blue-400">
          <ArrowRight className="h-4 w-4 rotate-180" />
          عودة لكل المقالات
        </Link>

        {/* Title block */}
        <h1 className="mb-4 text-3xl font-bold leading-tight text-slate-900 dark:text-slate-100 md:text-4xl">
          {post.title}
        </h1>
        <p className="mb-6 text-lg text-slate-600 dark:text-slate-400">{post.excerpt}</p>

        {/* Meta row */}
        <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-200 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {new Date(post.publishedAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {post.readingMinutes} دقيقة قراءة
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Tag className="h-4 w-4" />
            {post.tags.join(" • ")}
          </span>
        </div>

        {/* Body */}
        <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:text-slate-900 dark:prose-headings:text-slate-100 prose-h2:mt-10 prose-h2:text-2xl prose-h2:font-bold prose-h3:text-xl prose-h3:font-bold prose-p:leading-relaxed prose-li:my-1 prose-a:text-blue-700 dark:prose-a:text-blue-400">
          {children}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 dark:border-blue-900 dark:from-blue-950/30 dark:to-indigo-950/30">
          <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">جاهز للتَّجربة؟</h3>
          <p className="mb-4 text-slate-700 dark:text-slate-300">
            مستخدم واحد مجانى للأبد. لا بطاقة ائتمان مطلوبة. ادفع فقط عند احتياج مَقاعد إضافية.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/auth/sign-up" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700">
              ابدأ مجاناً <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-lg border-2 border-blue-300 px-6 py-3 font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400">
              تَحدَّث معنا
            </Link>
          </div>
        </div>

        {/* Other posts */}
        {others.length > 0 && (
          <div className="mt-12">
            <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">مقالات أخرى قد تَهمُّك</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {others.map(p => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                  <h4 className="mb-2 font-bold text-slate-900 dark:text-slate-100">{p.title}</h4>
                  <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{p.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        © {new Date().getFullYear()} 7esab.com • <Link href="/legal/privacy" className="hover:text-blue-700">الخصوصية</Link> • <a href="mailto:info@7esab.com" className="hover:text-blue-700">info@7esab.com</a>
      </footer>
    </div>
  )
}
