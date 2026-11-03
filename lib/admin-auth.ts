import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "mf_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const attempts = new Map<string, number[]>();

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET;
}

function signature(expires: string, secret: string) {
  return createHmac("sha256", secret).update(expires).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftHash = createHmac("sha256", "mf-admin-compare").update(left).digest();
  const rightHash = createHmac("sha256", "mf-admin-compare").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function adminAuthConfigured() {
  return Boolean(
    process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_PASSWORD.length >= 12 &&
      sessionSecret() &&
      sessionSecret()!.length >= 32,
  );
}

export function verifyAdminPassword(password: string, ip: string) {
  if (!adminAuthConfigured()) {
    return { ok: false as const, reason: "unconfigured" as const };
  }

  const now = Date.now();
  const recentAttempts = (attempts.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < 15 * 60 * 1000,
  );
  if (recentAttempts.length >= 5) {
    attempts.set(ip, recentAttempts);
    return { ok: false as const, reason: "rate-limited" as const };
  }

  const valid = safeEqual(password, process.env.ADMIN_PASSWORD!);
  if (!valid) {
    attempts.set(ip, [...recentAttempts, now]);
    return { ok: false as const, reason: "invalid" as const };
  }

  attempts.delete(ip);
  return { ok: true as const };
}

export function createAdminSession() {
  const secret = sessionSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET не настроен.");

  const expires = String(
    Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  );
  return `${expires}.${signature(expires, secret)}`;
}

export function isValidAdminSession(token: string | undefined) {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const [expires, providedSignature, extra] = token.split(".");
  if (
    !expires ||
    !providedSignature ||
    extra !== undefined ||
    !/^\d+$/.test(expires) ||
    Number(expires) <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return safeEqual(providedSignature, signature(expires, secret));
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  return isValidAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

export const adminSessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
};
