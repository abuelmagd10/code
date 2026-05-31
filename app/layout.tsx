import type React from "react"
import type { Metadata, Viewport } from "next"
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
import { SidebarLayoutProvider } from "@/components/SidebarLayoutProvider"
// dynamic with ssr:false must live inside a Client Component — see client-loader.tsx
import { AIAssistantClientLoader } from "@/components/ai-assistant/client-loader"
import { CommandPalette } from "@/components/CommandPalette"

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
  metadataBase: new URL("https://7esab.com"),
  title: {
    default: "7esab.com — نظام محاسبة وERP عربى للشركات المصرية",
    template: "%s | 7esab.com",
  },
  description:
    "نظام محاسبة وإدارة موارد متكامل بالعربى للشركات الصغيرة والمتوسطة فى مصر. " +
    "فواتير ضريبية، مخزون، مرتبات، تقارير IFRS، دفع بـ Paymob، مستخدم واحد مجانى للأبد.",
  generator: "Next.js",
  manifest: "/manifest.json",
  // v3.64.0 — keywords مُحسَّنة للسوق المصرى
  keywords: [
    "برنامج محاسبة", "محاسبة عربى", "ERP مصرى", "فواتير ضريبية", "VAT 14%",
    "مخزون", "مرتبات", "Paymob", "محاسبة شركات صغيرة", "ERP system Egypt",
    "Arabic accounting", "Egyptian SMB", "accounting invoices inventory", "7ESAB",
  ],
  authors: [{ name: "7ESAB", url: "https://7esab.com" }],
  creator: "7ESAB",
  publisher: "7ESAB",
  // v3.64.0 — Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "7esab.com — نظام ERP عربى للشركات المصرية",
    description: "محاسبة + مخزون + مرتبات + فواتير ضريبية بالجنيه المصرى. ابدأ مجاناً.",
    images: ["/icons/icon-512x512.png"],
  },
  // v3.64.0 — robots / SEO
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: {
    canonical: "https://7esab.com",
    languages: { "ar-EG": "https://7esab.com", "en-US": "https://7esab.com" },
  },
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
    siteName: "7esab.com",
    title: "7esab.com — نظام ERP عربى للشركات المصرية",
    description:
      "محاسبة + مخزون + مرتبات + فواتير ضريبية بالجنيه المصرى. " +
      "مستخدم واحد مجانى للأبد، دفع بـ Paymob، تَعدُّد عملات IAS 21.",
    url: "https://7esab.com",
    locale: "ar_EG",
    images: [
      {
        url: "/icons/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "7esab.com — Enterprise Resource Planning",
      },
    ],
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
        {/* v3.63.2 Cold-start: open TCP+TLS to Supabase during HTML parse
            so the first auth/data fetch saves ~100-300ms on cold loads. */}
        <link rel="preconnect" href="https://hfvsbsizokxontflgdyn.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://hfvsbsizokxontflgdyn.supabase.co" />
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
        {/* v3.64.0 — JSON-LD structured data for SEO (SoftwareApplication + Organization) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "SoftwareApplication",
                  name: "7esab.com ERP",
                  description:
                    "نظام محاسبة وإدارة موارد عربى للشركات المصرية الصغيرة والمتوسطة. فواتير، مخزون، مرتبات، تَعدُّد عملات.",
                  applicationCategory: "BusinessApplication",
                  applicationSubCategory: "AccountingSoftware",
                  operatingSystem: "Web Browser",
                  offers: [
                    {
                      "@type": "Offer",
                      name: "Free Plan",
                      price: "0",
                      priceCurrency: "EGP",
                      description: "مستخدم واحد مجانى للأبد",
                    },
                    {
                      "@type": "Offer",
                      name: "Additional User",
                      price: "500",
                      priceCurrency: "EGP",
                      description: "EGP 500 / user / month",
                    },
                  ],
                  inLanguage: ["ar", "en"],
                  url: "https://7esab.com",
                },
                {
                  "@type": "Organization",
                  name: "7esab.com",
                  url: "https://7esab.com",
                  logo: "https://7esab.com/icons/icon-512x512.png",
                  email: "info@7esab.com",
                  contactPoint: {
                    "@type": "ContactPoint",
                    contactType: "customer support",
                    email: "info@7esab.com",
                    availableLanguage: ["Arabic", "English"],
                    areaServed: "EG",
                  },
                  address: {
                    "@type": "PostalAddress",
                    addressCountry: "EG",
                  },
                },
              ],
            }),
          }}
        />
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
                      <SidebarLayoutProvider />
                      <ErrorBoundary>
                        {children}
                      </ErrorBoundary>
                    </AppShell>
                    <CommandPalette />
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
