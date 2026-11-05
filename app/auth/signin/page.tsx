import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import SignInOptions from "@/components/SignInOptions";

export const metadata = {
  title: "Вход в личный кабинет",
  robots: { index: false, follow: false },
};

type SignInPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default function SignInPage({ searchParams }: SignInPageProps) {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}

function SignInLoading() {
  return (
    <main className="account-page">
      <section className="account-panel signin-panel" aria-busy="true">
        <p className="account-eyebrow">MOON FLOWER</p>
        <h1>Личный кабинет</h1>
      </section>
    </main>
  );
}

async function SignInContent({ searchParams }: SignInPageProps) {
  await connection();
  const params = await searchParams;
  const callbackUrl = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  let redirectTo = "/account";

  if (callbackUrl) {
    try {
      const baseUrl = new URL(process.env.AUTH_URL ?? "http://localhost:3000");
      const targetUrl = new URL(callbackUrl, baseUrl);
      if (targetUrl.origin === baseUrl.origin) {
        redirectTo = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
      }
    } catch (error) {
      console.error("Некорректный адрес возврата после входа.", error);
    }
  }

  return (
    <main className="account-page">
      <section className="account-panel signin-panel">
        <Link className="account-back-link" href="/">
          ← Вернуться в каталог
        </Link>
        <p className="account-eyebrow">MOON FLOWER</p>
        <h1>Личный кабинет</h1>
        <p className="account-intro">
          Войдите через удобный сервис — пароль для сайта не нужен.
        </p>
        <SignInOptions
          redirectTo={redirectTo}
          vkReady={Boolean(
            process.env.AUTH_VKID_ID && process.env.AUTH_VKID_SECRET,
          )}
          telegramReady={Boolean(
            process.env.AUTH_TELEGRAM_ID && process.env.AUTH_TELEGRAM_SECRET,
          )}
        />
      </section>
    </main>
  );
}
