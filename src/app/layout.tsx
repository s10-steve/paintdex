import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { CollectionProvider } from "@/components/collection/collection-provider";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_TITLE = "Paintdex — miniature paint comparison & colour matcher";
const SITE_DESCRIPTION =
  "Compare miniature paints across brands with hex colour values, find alternatives to any paint with perceptual colour matching, and plan whole paint schemes.";

export const metadata: Metadata = {
  metadataBase: new URL("https://paintdex.app"),
  title: {
    default: SITE_TITLE,
    template: "%s · Paintdex",
  },
  description: SITE_DESCRIPTION,
  // Sensible default; each page overrides with its own canonical path.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Paintdex",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "Paintdex" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            {/* Inside AuthProvider: the collection is per-user and keys its
                load on `user?.id`. Inert until someone signs in, so this costs
                a signed-out visitor one context and no request. */}
            <CollectionProvider>
              <SiteHeader />
              <div className="flex-1">{children}</div>
              <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
                <p className="mx-auto max-w-2xl px-4">
                  Paintdex is not affiliated with any paint manufacturer or game
                  publisher. Brand, product and faction names are trademarks of their
                  respective owners. Example schemes are unofficial fan recipes.
                </p>
              </footer>
            </CollectionProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
