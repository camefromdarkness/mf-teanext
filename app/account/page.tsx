import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import SignOutButton from "@/components/SignOutButton";

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountLoading />}>
      <AccountContent />
    </Suspense>
  );
}

function AccountLoading() {
  return (
    <main className="account-page">
      <section className="account-panel" aria-busy="true">
        <p className="account-eyebrow">MOON FLOWER</p>
        <h1>Личный кабинет</h1>
      </section>
    </main>
  );
}

async function AccountContent() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return (
    <main className="account-page">
      <section className="account-panel">
        <Link className="account-back-link" href="/">
          ← Вернуться в каталог
        </Link>
        <p className="account-eyebrow">MOON FLOWER</p>
        <h1>Личный кабинет</h1>
        <div className="account-profile">
          {session.user.image ? (
            <Image
              className="account-avatar"
              src={session.user.image}
              alt=""
              width={64}
              height={64}
              unoptimized
            />
          ) : (
            <div className="account-avatar account-avatar-placeholder" aria-hidden="true">
              {(session.user.name ?? "П").slice(0, 1).toLocaleUpperCase("ru")}
            </div>
          )}
          <div>
            <h2>{session.user.name ?? "Пользователь"}</h2>
            {session.user.email && <p>{session.user.email}</p>}
          </div>
        </div>
        <div className="account-details">
          <p>Профиль подтверждён через VK ID или Telegram.</p>
          <p>История заказов появится здесь после подключения оформления заказов.</p>
        </div>
        <SignOutButton />
      </section>
    </main>
  );
}
