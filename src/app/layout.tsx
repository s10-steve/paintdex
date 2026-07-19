import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    "Search and filter a community-maintained database of miniature paints with hex colour values, and find visually similar colours across brands.",
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
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
            <p>
              Open-source paint data ·{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://github.com/s10-steve/paintdex"
                target="_blank"
                rel="noreferrer"
              >
                Contribute on GitHub
              </a>
            </p>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
