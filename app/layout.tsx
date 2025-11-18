import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Zoho Books Clone",
  description: "تطبيق محاسبة شامل",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <Script id="lang-init" strategy="beforeInteractive">
          {`(function(){try{var ck=(document.cookie||'').split('; ').find(function(x){return x.indexOf('app_language=')===0});var cv=ck?ck.split('=')[1]:null;var v=cv||localStorage.getItem('app_language')||'ar';var l=(v==='en'?'en':'ar');document.documentElement.lang=l;document.documentElement.dir=(l==='en'?'ltr':'rtl');window.addEventListener('app_language_changed',function(){try{var ck2=(document.cookie||'').split('; ').find(function(x){return x.indexOf('app_language=')===0});var cv2=ck2?ck2.split('=')[1]:null;var v2=cv2||localStorage.getItem('app_language')||'ar';var l2=(v2==='en'?'en':'ar');document.documentElement.lang=l2;document.documentElement.dir=(l2==='en'?'ltr':'rtl');}catch(e){}});window.addEventListener('storage',function(e){try{if(e&&e.key==='app_language'){var v3=e.newValue||'ar';var l3=(v3==='en'?'en':'ar');document.documentElement.lang=l3;document.documentElement.dir=(l3==='en'?'ltr':'rtl');}}catch(e){}});}catch(e){}})();`}
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
