import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSiteUrl } from "@/lib/site-url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
