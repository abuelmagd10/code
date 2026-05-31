/**
 * Sitemap.xml — auto-generated at /sitemap.xml
 * v3.64.0
 *
 * Only public-facing URLs go here. Authenticated routes (dashboard, settings…)
 * are intentionally excluded — Google has no business indexing them.
 */
import type { MetadataRoute } from "next"

const BASE = "https://7esab.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BASE}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/legal/refund`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/auth/sign-up`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/auth/login`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ]
}
