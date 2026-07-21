import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "Search and filter a database of miniature paints with hex colour values, find visually similar colours across brands, and plan whole paint schemes.";

export const metadata: Metadata = {
  metadataBase: new URL("https://paintdex.app"),
  title: {
    default: "Paintdex — miniature paint database & colour matcher",
    template: "%s · Paintdex",
  },
  description: SITE_DESCRIPTION,
  // Sensible default; each page overrides with its own canonical path.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Paintdex",
    title: "Paintdex — miniature paint database & colour matcher",
    description: SITE_DESCRIPTION,
    url: "/",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "Paintdex" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Paintdex — miniature paint database & colour matcher",
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
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
              <p className="mx-auto max-w-2xl px-4">
                Paintdex is not affiliated with any paint manufacturer. Brand and
                product names are trademarks of their respective owners.
              </p>
            </footer>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
