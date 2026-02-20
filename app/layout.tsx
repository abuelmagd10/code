import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/theme-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { CurrencySyncProvider } from "./currency-sync-provider"
import { PermissionsProvider } from "@/lib/permissions-context"
import { AccessProvider } from "@/lib/access-context"
import { RealtimeProvider } from "@/lib/realtime-provider"
import { AppShell } from "@/components/app-shell"
// dynamic with ssr:false must live inside a Client Component — see client-loader.tsx
import { AIAssistantClientLoader } from "@/components/ai-assistant/client-loader"

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
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-48x48.png", sizes: "48x48", type: "image/png" },
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
        {/* Favicon - explicit for all browsers */}
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="icon" href="/icons/icon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/icons/icon-16x16.png" sizes="16x16" type="image/png" />
        {/* PWA Meta Tags */}
        <meta name="application-name" content="7ESAB ERP" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="7ESAB ERP" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-tap-highlight" content="no" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
      </head>
      <body className={`font-sans antialiased touch-manipulation`}>
        <Script id="lang-init" strategy="beforeInteractive">
          {`(function(){try{var ck=(document.cookie||'').split('; ').find(function(x){return x.indexOf('app_language=')===0});var cv=ck?ck.split('=')[1]:null;var v=cv||localStorage.getItem('app_language')||'ar';var l=(v==='en'?'en':'ar');document.documentElement.lang=l;document.documentElement.dir=(l==='en'?'ltr':'rtl');window.addEventListener('app_language_changed',function(){try{var ck2=(document.cookie||'').split('; ').find(function(x){return x.indexOf('app_language=')===0});var cv2=ck2?ck2.split('=')[1]:null;var v2=cv2||localStorage.getItem('app_language')||'ar';var l2=(v2==='en'?'en':'ar');document.documentElement.lang=l2;document.documentElement.dir=(l2==='en'?'ltr':'rtl');}catch(e){}});window.addEventListener('storage',function(e){try{if(e&&e.key==='app_language'){var v3=e.newValue||'ar';var l3=(v3==='en'?'en':'ar');document.documentElement.lang=l3;document.documentElement.dir=(l3==='en'?'ltr':'rtl');}}catch(e){}});}catch(e){}})();`}
        </Script>
        {/* ✅ Global AbortError Handler - Silently ignore AbortErrors from unmounted components */}
        <Script id="abort-error-handler" strategy="afterInteractive">
          {`(function(){if(typeof window!=='undefined'){window.addEventListener('unhandledrejection',function(event){var error=event.reason;if(error&&(error.name==='AbortError'||(error.message&&error.message.includes('aborted'))||(error.toString&&error.toString().includes('AbortError')))){event.preventDefault();console.warn('⚠️ [Global] Unhandled AbortError suppressed (component unmounted):',error.message||error.toString());return false;}});}})();`}
        </Script>
        {/* Service Worker Registration - Secure Multi-Tenant */}
        <Script src="/sw-register.js" strategy="afterInteractive" />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            <CurrencySyncProvider>
              <PermissionsProvider>
                <AccessProvider>
                  <RealtimeProvider autoSubscribe={['notifications']}>
                    <AppShell>
                      <ErrorBoundary>
                        {children}
                      </ErrorBoundary>
                    </AppShell>
                    <AIAssistantClientLoader />
                    <Toaster />
                    {process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true" ? <Analytics /> : null}
                  </RealtimeProvider>
                </AccessProvider>
              </PermissionsProvider>
            </CurrencySyncProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
