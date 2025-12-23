import { NextResponse } from 'next/server'

/**
 * API endpoint لتقديم manifest.json بشكل صحيح
 * يضمن إرجاع JSON صالح مع Content-Type صحيح
 */
export async function GET() {
  const manifest = {
    name: "7ESAB ERP",
    short_name: "7ESAB",
    description: "Enterprise Resource Planning System",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    }
  })
}

