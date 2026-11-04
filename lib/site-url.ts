const DEFAULT_SITE_URL = "https://cvrxd.twilightparadox.com";

export function getSiteUrl() {
  return new URL(process.env.SITE_URL || DEFAULT_SITE_URL);
}

export function isPublicSiteConfigured() {
  return Boolean(process.env.SITE_URL);
}
