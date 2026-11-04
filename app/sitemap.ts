import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSiteUrl, isPublicSiteConfigured } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  if (!isPublicSiteConfigured()) return [];

  return [{ url: getSiteUrl().toString() }];
}
