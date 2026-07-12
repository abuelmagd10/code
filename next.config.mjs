/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Explicitly set project root to avoid lockfile root inference warning
    root: process.cwd(),
  },
  // pdfkit + fontkit must NOT be bundled — they're CommonJS Node modules with
  // optional native deps that Turbopack/webpack can't safely transform.
  // They're required only by server API routes (Node.js runtime).
  serverExternalPackages: ['pdfkit', 'fontkit'],
  compiler: {
    // Strip console.* (except error/warn) from PRODUCTION builds only.
    // Reduces main-thread work during interactions (better INP) and keeps the
    // browser console clean in front of clients. Local dev keeps ALL logs, and
    // console.error / console.warn are preserved so real diagnostics + Sentry
    // still work.
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/sw-register.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
  // Force rebuild: 2026-01-31 - Fix expense number generation (bypass Vercel cache)
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
}

// ─── Sentry integration ──────────────────────────────────────────────────────
// withSentryConfig is what actually wires Sentry into Next.js: it uploads
// source maps at build time, injects the SDK into the bundle, and sets up
// tunnel routing so ad-blockers don't drop our error events.
import { withSentryConfig } from "@sentry/nextjs"

export default withSentryConfig(nextConfig, {
  // The org and project slugs in Sentry. These are PUBLIC identifiers.
  org: "7esaberb",
  project: "7esab-erb",

  // Only print logs for uploading source maps in CI; locally it's noisy.
  silent: !process.env.CI,

  // Use a tunnel route so ad-blockers/extensions can't block /api/sentry-events
  // and we still see errors from users with blockers installed.
  tunnelRoute: "/monitoring",

  // Hide source maps from public bundles after upload (smaller payloads,
  // and stack-trace symbolication still works via Sentry).
  hideSourceMaps: true,

  // Disable Vercel's "Sentry Suggested Issues" UI noise during PR previews.
  disableLogger: true,

  // Auto-instrument React component tracing (small overhead, very useful).
  reactComponentAnnotation: { enabled: true },
})

