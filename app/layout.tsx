import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_BOOT } from "@/lib/theme";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Rounded type for the "Cozy clay" theme.
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse: talk to someone, somewhere, right now",
  description: "A living globe of anonymous strangers. Tap a dot, start talking.",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  viewportFit: "cover", // lets safe-area insets work on notched phones
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${baloo.variable} ${geistMono.variable} h-full antialiased`}
      // data-theme is set by THEME_BOOT before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
