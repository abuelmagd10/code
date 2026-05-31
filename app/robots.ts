/**
 * robots.txt — auto-generated at /robots.txt
 * v3.64.0
 *
 * Disallow everything authenticated so bots stop wasting crawl budget on
 * pages that would just redirect to login anyway.
 */
import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/contact", "/legal", "/blog", "/auth/sign-up", "/auth/login"],
        disallow: [
          "/api/",
          "/dashboard",
          "/settings",
          "/customers",
          "/invoices",
          "/bills",
          "/suppliers",
          "/products",
          "/inventory",
          "/banking",
          "/accounting",
          "/reports",
          "/hr",
          "/manufacturing",
          "/admin",
          "/auth/callback",
          "/auth/force-change-password",
          "/onboarding",
          "/suspended",
          "/no-access",
          "/monitoring",
        ],
      },
    ],
    sitemap: "https://7esab.com/sitemap.xml",
    host: "https://7esab.com",
  }
}
