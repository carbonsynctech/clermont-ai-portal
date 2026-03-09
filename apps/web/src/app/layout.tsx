import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const siteUrl = (() => {
  try {
    return new URL(configuredSiteUrl).origin;
  } catch {
    return "http://localhost:3000";
  }
})();

async function resolveRequestOrigin() {
  const fallback = siteUrl;

  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") ?? "https";

    if (!host) {
      return fallback;
    }

    return `${proto}://${host}`;
  } catch {
    return fallback;
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestOrigin = await resolveRequestOrigin();
  const metadataBase = new URL(requestOrigin);
  const socialPreviewImage = new URL("/social-preview.png", requestOrigin).toString();

  return {
    metadataBase,
    title: "Clermont Group | AI Content Portal 2026",
    description:
      "Create high-quality investment memos faster with an AI-assisted, auditable workflow for research, drafting, review, and export.",
    alternates: {
      canonical: "/",
    },
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: "/site-icon.png", type: "image/png" },
      ],
      shortcut: ["/favicon.ico"],
      apple: [{ url: "/site-icon.png", type: "image/png" }],
    },
    openGraph: {
      title: "Clermont Group | AI Content Portal 2026",
      description:
        "Turn source material into investor-ready memos with a structured AI workflow, human review checkpoints, and polished exports.",
      url: requestOrigin,
      images: [
        {
          url: socialPreviewImage,
          width: 1200,
          height: 630,
          alt: "AI Content Portal social preview",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Clermont AI Portal | Investment Memo Studio",
      description:
        "Turn source material into investor-ready memos with a structured AI workflow, human review checkpoints, and polished exports.",
      images: [socialPreviewImage],
    },
  };
}

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
