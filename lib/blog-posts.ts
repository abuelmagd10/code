/**
 * Blog post registry — v3.65.0
 *
 * Single source of truth for blog metadata. The listing page (/blog) reads
 * this array; each post's full body lives in its own /blog/<slug>/page.tsx
 * so we can use real React for diagrams, internal links, code blocks, and
 * JSON-LD Article schema without pulling in markdown parsers.
 *
 * Add a new article in 3 steps:
 *   1. Add an entry here.
 *   2. Create app/blog/<slug>/page.tsx using <BlogPostLayout> from
 *      components/blog/BlogPostLayout.
 *   3. Add the URL to app/sitemap.ts.
 */

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  publishedAt: string // ISO date
  readingMinutes: number
  tags: string[]
  ogImage?: string
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "best-arabic-accounting-software-egypt-2026",
    title: "أفضل برنامج محاسبة عربى للشركات المصرية فى 2026 — مقارنة صريحة",
    excerpt:
      "مراجعة أمينة لأبرز برامج المحاسبة المُتاحة للسوق المصرى: السعر، الميزات، الدعم، نقاط القوة والضعف الحقيقية لكل خيار.",
    publishedAt: "2026-05-31",
    readingMinutes: 8,
    tags: ["مقارنة", "محاسبة", "اختيار البرنامج"],
  },
  {
    slug: "vat-14-egypt-small-business-guide",
    title: "دليل ضريبة القيمة المضافة 14% للمنشآت الصغيرة فى مصر",
    excerpt:
      "كل ما تَحتاج معرفته عن VAT 14% بالأمثلة العملية: متى تَدفع، كيف تَحسب، أهم الأخطاء التى تُكلِّفك مالاً، وكيف تَحمى نَفسك بالأتمتة.",
    publishedAt: "2026-05-31",
    readingMinutes: 10,
    tags: ["ضرائب", "VAT", "امتثال"],
  },
  {
    slug: "excel-to-erp-migration-guide",
    title: "كيف تَنتقل من Excel إلى نظام ERP — دليل عملى من 6 خطوات",
    excerpt:
      "Excel أداة رائعة، لكنه يَنكسر عند 10+ موظفين أو عدة فروع. دليل عَملى لنقل بياناتك بأمان مع تَجنُّب أهم 5 أخطاء يَقع فيها أصحاب المنشآت.",
    publishedAt: "2026-05-31",
    readingMinutes: 9,
    tags: ["هجرة", "Excel", "نمو"],
  },
]

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find(p => p.slug === slug)
}

export function getAllPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}
