import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#1e40af" },
  ],
}

export const metadata: Metadata = {
  title: "7ESAB ERP",
  description: "نظام محاسبة وإدارة موارد المؤسسات - ERP Professional System",
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: ["ERP", "محاسبة", "فواتير", "مخزون", "accounting", "invoices", "inventory", "7ESAB"],
  authors: [{ name: "7ESAB" }],
  creator: "7ESAB",
  publisher: "7ESAB",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "7ESAB ERP",
  },
  openGraph: {
    type: "website",
    siteName: "7ESAB ERP",
    title: "7ESAB ERP",
    description: "نظام محاسبة وإدارة موارد المؤسسات",
  },
  icons: {
    icon: [
      { url: "/icons/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180" },
      { url: "/icons/icon-152x152.png", sizes: "152x152" },
      { url: "/icons/icon-192x192.png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/favicon.png" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags */}
        <meta name="application-name" content="7ESAB ERP" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="7ESAB ERP" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-tap-highlight" content="no" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
      </head>
      <body className={`font-sans antialiased touch-manipulation`}>
        <Script id="lang-init" strategy="beforeInteractive">
          {`(function(){try{var ck=(document.cookie||'').split('; ').find(function(x){return x.indexOf('app_language=')===0});var cv=ck?ck.split('=')[1]:null;var v=cv||localStorage.getItem('app_language')||'ar';var l=(v==='en'?'en':'ar');document.documentElement.lang=l;document.documentElement.dir=(l==='en'?'ltr':'rtl');window.addEventListener('app_language_changed',function(){try{var ck2=(document.cookie||'').split('; ').find(function(x){return x.indexOf('app_language=')===0});var cv2=ck2?ck2.split('=')[1]:null;var v2=cv2||localStorage.getItem('app_language')||'ar';var l2=(v2==='en'?'en':'ar');document.documentElement.lang=l2;document.documentElement.dir=(l2==='en'?'ltr':'rtl');}catch(e){}});window.addEventListener('storage',function(e){try{if(e&&e.key==='app_language'){var v3=e.newValue||'ar';var l3=(v3==='en'?'en':'ar');document.documentElement.lang=l3;document.documentElement.dir=(l3==='en'?'ltr':'rtl');}}catch(e){}});}catch(e){}})();`}
        </Script>
        {/* Service Worker Registration */}
        <Script id="sw-register" strategy="afterInteractive">
          {`if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').then(function(reg){console.log('SW registered:',reg.scope)}).catch(function(err){console.log('SW registration failed:',err)})})}`}
        </Script>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
          {process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true" ? <Analytics /> : null}
        </ThemeProvider>
      </body>
    </html>
  )
}
