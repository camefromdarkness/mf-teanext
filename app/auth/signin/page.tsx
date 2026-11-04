import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import SignInOptions from "@/components/SignInOptions";

export const metadata = {
  title: "Вход в личный кабинет",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInContent />
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

async function SignInContent() {
  await connection();

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
