import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://paintdex.app"),
  title: {
    default: "Paintdex — miniature paint database & colour matcher",
    template: "%s · Paintdex",
  },
  description:
    "Search and filter a database of miniature paints with hex colour values, find visually similar colours across brands, and plan whole paint schemes.",
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
          <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-200">
            🚧 Paintdex is a work in progress — the paint data is still being
            checked and features may change.
          </div>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
            <p className="mx-auto max-w-2xl px-4">
              Paintdex is not affiliated with any paint manufacturer. Brand and
              product names are trademarks of their respective owners.
            </p>
          </footer>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
