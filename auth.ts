import NextAuth from "next-auth";
import type { OAuthConfig, OIDCConfig } from "next-auth/providers";
import type {
  TokenEndpointHandler,
  UserinfoEndpointHandler,
} from "@auth/core/providers/oauth";
import type { TokenSet } from "@auth/core/types";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

type VkProfile = {
  user_id?: string | number;
  id?: string | number;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  avatar?: string;
  photo?: string;
};

type TelegramProfile = {
  sub: string;
  id?: string | number;
  name?: string;
  preferred_username?: string;
  picture?: string;
};

type VkTokenRequestContext = {
  params: Record<string, unknown>;
  checks: { code_verifier?: unknown };
  provider: {
    clientId?: string;
    clientSecret?: string;
    callbackUrl: string;
  };
};

type VkUserinfoRequestContext = {
  tokens: TokenSet;
  provider: { clientId?: string };
};

const vkTokenEndpoint: TokenEndpointHandler = {
  url: "https://id.vk.ru/oauth2/auth",
  async request({ params, checks, provider }: VkTokenRequestContext) {
    const code = params.code;
    const deviceId = params.device_id;
    const codeVerifier = checks.code_verifier;
    if (
      typeof code !== "string" ||
      typeof deviceId !== "string" ||
      typeof codeVerifier !== "string" ||
      !provider.clientId ||
      !provider.clientSecret
    ) {
      throw new Error("VK ID вернул неполные данные для обмена кода.");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      device_id: deviceId,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: provider.callbackUrl,
      code_verifier: codeVerifier,
    });
    if (typeof params.state === "string") {
      body.set("state", params.state);
    }

    const response = await fetch("https://id.vk.ru/oauth2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error(`VK ID не принял код авторизации (${response.status}).`);
    }

    const tokens: unknown = await response.json();
    if (
      typeof tokens !== "object" ||
      tokens === null ||
      !("access_token" in tokens) ||
      typeof tokens.access_token !== "string"
    ) {
      throw new Error("VK ID не выдал токен доступа.");
    }
    return { tokens: tokens as TokenSet };
  },
};

const vkUserinfoEndpoint: UserinfoEndpointHandler = {
  url: "https://id.vk.ru/oauth2/user_info",
  async request({ tokens, provider }: VkUserinfoRequestContext) {
    if (!tokens.access_token || !provider.clientId) {
      throw new Error("VK ID не выдал access token.");
    }

    const response = await fetch("https://id.vk.ru/oauth2/user_info", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: tokens.access_token,
        client_id: provider.clientId,
      }),
    });
    if (!response.ok) {
      throw new Error(`VK ID не вернул профиль пользователя (${response.status}).`);
    }

    const result: unknown = await response.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("user" in result) ||
      typeof result.user !== "object" ||
      result.user === null ||
      !("user_id" in result.user) ||
      (typeof result.user.user_id !== "number" &&
        typeof result.user.user_id !== "string")
    ) {
      throw new Error("VK ID вернул профиль в неизвестном формате.");
    }

    return result.user as VkProfile;
  },
};

const vkIdProvider: OAuthConfig<VkProfile> = {
  id: "vkid",
  name: "VK ID",
  type: "oauth",
  clientId: process.env.AUTH_VKID_ID ?? "",
  clientSecret: process.env.AUTH_VKID_SECRET ?? "",
  checks: ["pkce", "state"],
  authorization: "https://id.vk.ru/authorize?scope=vkid.personal_info",
  token: vkTokenEndpoint,
  userinfo: vkUserinfoEndpoint,
  client: { token_endpoint_auth_method: "client_secret_post" },
  profile(profile) {
    const id = profile.user_id ?? profile.id;
    if (id === undefined) throw new Error("VK ID не вернул идентификатор пользователя.");

    const name =
      profile.name ??
      [profile.first_name, profile.last_name].filter(Boolean).join(" ");

    return {
      id: String(id),
      name: name || null,
      email: profile.email ?? null,
      image: profile.avatar ?? profile.photo ?? null,
    };
  },
  account() {
    return {
      access_token: undefined,
      refresh_token: undefined,
      id_token: undefined,
      expires_at: undefined,
    };
  },
};

const telegramProvider: OIDCConfig<TelegramProfile> = {
  id: "telegram",
  name: "Telegram",
  type: "oidc",
  issuer: "https://oauth.telegram.org",
  clientId: process.env.AUTH_TELEGRAM_ID ?? "",
  clientSecret: process.env.AUTH_TELEGRAM_SECRET ?? "",
  authorization: {
    params: {
      scope: "openid profile",
      origin: process.env.AUTH_URL
        ? new URL(process.env.AUTH_URL).origin
        : undefined,
    },
  },
  checks: ["pkce", "state", "nonce"],
  idToken: true,
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.name ?? profile.preferred_username ?? "Пользователь Telegram",
      image: profile.picture ?? null,
    };
  },
  account() {
    return {
      access_token: undefined,
      refresh_token: undefined,
      id_token: undefined,
      expires_at: undefined,
    };
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [vkIdProvider, telegramProvider],
  pages: { signIn: "/auth/signin" },
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role ?? "CUSTOMER";
      }
      return session;
    },
  },
});
