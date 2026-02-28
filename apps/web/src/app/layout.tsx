import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clermont Group | AI Content Portal 2026",
  description:
    "Create high-quality investment memos faster with an AI-assisted, auditable workflow for research, drafting, review, and export.",
  icons: {
    icon: "/site-icon.png",
    shortcut: "/site-icon.png",
    apple: "/site-icon.png",
  },
  openGraph: {
    title: "Clermont Group | AI Content Portal 2026",
    description:
      "Turn source material into investor-ready memos with a structured AI workflow, human review checkpoints, and polished exports.",
    images: [
      {
        url: "/social-preview.png",
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
