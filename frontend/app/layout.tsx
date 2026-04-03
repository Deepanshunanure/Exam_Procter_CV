import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { HealthBadge } from "@/components/health-badge";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProctorAI - Exam Monitoring Dashboard",
  description: "AI-powered proctoring and exam monitoring system",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-gray-950 text-white min-h-screen">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-gray-950/80">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold">ProctorAI</span>
            </a>
            <HealthBadge />
          </div>
        </nav>

        {/* Main content */}
        <main>{children}</main>

        <Analytics />
      </body>
    </html>
  );
}
