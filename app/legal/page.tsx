import Link from "next/link"
import { Scale, Shield, RefreshCw } from "lucide-react"

export const metadata = {
  title: "الشروط والسياسات | 7esab.com",
}

export default function LegalIndexPage() {
  const cards = [
    {
      href: "/legal/terms",
      title: "شروط الاستخدام",
      desc: "القواعد التى تحكم استخدام المنصة والتزاماتك والتزاماتنا.",
      icon: Scale,
      color: "blue",
    },
    {
      href: "/legal/privacy",
      title: "سياسة الخصوصية",
      desc: "كيف نجمع ونحمى ونستخدم بياناتك وفقاً لـ PDPL و GDPR.",
      icon: Shield,
      color: "emerald",
    },
    {
      href: "/legal/refund",
      title: "سياسة الاسترداد",
      desc: "متى وكيف يمكنك استرداد قيمة اشتراكك.",
      icon: RefreshCw,
      color: "amber",
    },
  ]

  return (
    <article>
      <h1>الشروط والسياسات</h1>
      <p className="text-lg">
        اخترنا الوضوح والشفافية فى كل تفاصيل علاقتنا معك. كل صفحة مكتوبة بلغة بسيطة، وتوضح حقوقك والتزاماتك.
      </p>

      <div className="not-prose mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group block rounded-xl border border-slate-200 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
            >
              <Icon className={`mb-3 h-8 w-8 text-${card.color}-600`} />
              <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                {card.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{card.desc}</p>
              <span className="mt-3 inline-block text-sm font-medium text-blue-700 group-hover:underline dark:text-blue-400">
                اقرأ المزيد ←
              </span>
            </Link>
          )
        })}
      </div>

      <h2 className="mt-12">للتواصل</h2>
      <ul>
        <li>أسئلة عامة: <a href="mailto:info@7esab.com">info@7esab.com</a></li>
        <li>الخصوصية والبيانات: <a href="mailto:privacy@7esab.com">privacy@7esab.com</a></li>
        <li>الفواتير والاسترداد: <a href="mailto:billing@7esab.com">billing@7esab.com</a></li>
        <li>الدعم الفنى: <a href="mailto:support@7esab.com">support@7esab.com</a></li>
      </ul>
    </article>
  )
}
