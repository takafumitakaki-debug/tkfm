import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { site } from "@/content/site";
import { themeVars } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: site.seo.title,
  description: site.seo.description,
  metadataBase: site.seo.url ? new URL(site.seo.url) : undefined,
  openGraph: {
    title: site.seo.title,
    description: site.seo.description,
    siteName: site.brand.name,
    type: "website",
    locale: "ja_JP",
    images: site.seo.ogImage ? [site.seo.ogImage] : undefined,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: site.theme.primary };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ga = site.analytics?.gaId;
  const pixel = site.analytics?.metaPixelId;
  return (
    <html lang="ja" style={themeVars(site.theme)}>
      <body>
        <Providers>{children}</Providers>
        {ga && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}
            </Script>
          </>
        )}
        {pixel && (
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
          </Script>
        )}
      </body>
    </html>
  );
}
