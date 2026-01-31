/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Explicitly set project root to avoid lockfile root inference warning
    root: process.cwd(),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Force rebuild: 2026-01-31 - Fix expense number generation (bypass Vercel cache)
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
}

export default nextConfig
