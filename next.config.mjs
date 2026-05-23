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

export default nextConfig
