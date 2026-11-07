import type { Metadata } from "next";
import { getSiteUrl, isPublicSiteConfigured } from "@/lib/site-url";
import "./globals.css";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  const indexable = isPublicSiteConfigured();

  return {
    metadataBase: siteUrl,
    title: {
      default: "MOON FLOWER — настоящий китайский чай",
      template: "%s | MOON FLOWER",
    },
    description: "Настоящий китайский чай, который дарит вкус, энергию и удовольствие.",
    applicationName: "MOON FLOWER",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "MOON FLOWER",
      title: "MOON FLOWER — настоящий китайский чай",
      description: "Настоящий китайский чай, который дарит вкус, энергию и удовольствие.",
      url: siteUrl,
      images: [
        {
          url: "/logo-social.png",
          width: 640,
          height: 644,
          alt: "Логотип MOON FLOWER",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: "MOON FLOWER — настоящий китайский чай",
      description: "Настоящий китайский чай, который дарит вкус, энергию и удовольствие.",
      images: ["/logo-social.png"],
    },
    robots: {
      index: indexable,
      follow: indexable,
      googleBot: {
        index: indexable,
        follow: indexable,
      },
    },
    icons: { icon: "/favicon.ico" },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
