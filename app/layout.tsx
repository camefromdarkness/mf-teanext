import type { Metadata } from "next";
import { getSiteUrl, isPublicSiteConfigured } from "@/lib/site-url";
import "./globals.css";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  const indexable = isPublicSiteConfigured();

  return {
    metadataBase: siteUrl,
    title: {
      default: "MOON FLOWER — китайский чай: улуны, ГАБА и красный чай",
      template: "%s | MOON FLOWER",
    },
    description:
      "Китайский чай MOON FLOWER: улуны, ГАБА и красный чай. Изучите коллекцию, выберите чай по вкусу и оформите заказ онлайн.",
    applicationName: "MOON FLOWER",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "MOON FLOWER",
      title: "MOON FLOWER — китайский чай",
      description:
        "Улуны, ГАБА и красный чай в коллекции MOON FLOWER. Выберите свой вкус и оформите заказ онлайн.",
      url: siteUrl,
    },
    twitter: {
      card: "summary",
      title: "MOON FLOWER — китайский чай",
      description:
        "Улуны, ГАБА и красный чай в коллекции MOON FLOWER.",
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
