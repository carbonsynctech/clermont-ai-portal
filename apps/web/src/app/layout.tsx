import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Clermont Group | AI Content Portal 2026",
  description:
    "Create high-quality investment memos faster with an AI-assisted, auditable workflow for research, drafting, review, and export.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/site-icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/site-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Clermont Group | AI Content Portal 2026",
    description:
      "Turn source material into investor-ready memos with a structured AI workflow, human review checkpoints, and polished exports.",
    url: "/",
    images: [
      {
        url: "/social-preview.png",
        width: 1200,
        height: 630,
        alt: "AI Content Portal social preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Content Portal | Investment Memo Studio",
    description:
      "Turn source material into investor-ready memos with a structured AI workflow, human review checkpoints, and polished exports.",
    images: ["/social-preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
