import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { auth } from "@/auth";
import AccountTabs from "@/components/AccountTabs";
import AccountProfileForm from "@/components/AccountProfileForm";
import SignOutButton from "@/components/SignOutButton";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Личный кабинет",
  robots: { index: false, follow: false },
};

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
  await connection();
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { items: true },
      },
    },
  });
  if (!profile) redirect("/auth/signin");

  return (
    <main className="account-page">
      <section className="account-panel account-dashboard">
        <Link className="account-back-link" href="/">
          ← Вернуться в каталог
        </Link>
        <p className="account-eyebrow">MOON FLOWER</p>
        <h1>Личный кабинет</h1>
        <AccountTabs
          profileContent={
            <>
              <div className="account-profile">
                {profile.image ? (
                  <Image
                    className="account-avatar"
                    src={profile.image}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                  />
                ) : (
                  <div
                    className="account-avatar account-avatar-placeholder"
                    aria-hidden="true"
                  >
                    {(profile.name ?? "П").slice(0, 1).toLocaleUpperCase("ru")}
                  </div>
                )}
                <div>
                  <h2>{profile.name ?? "Пользователь"}</h2>
                  {profile.email && <p>{profile.email}</p>}
                </div>
              </div>
              <p className="account-member-since">
                В MOON FLOWER с{" "}
                {profile.createdAt.toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <AccountProfileForm
                name={profile.name ?? ""}
                phoneNumber={profile.phoneNumber ?? ""}
                publicId={profile.publicId}
              />
            </>
          }
          ordersContent={
            <section
              className="account-orders-section"
              aria-labelledby="orders-title"
            >
              <h2 id="orders-title">История заказов</h2>
              {profile.orders.length === 0 ? (
                <p className="account-orders-empty">
                  Здесь появятся ваши заказы. Добавьте чай в корзину, чтобы
                  оформить первый.
                </p>
              ) : (
                <div className="account-orders">
                  {profile.orders.map((order) => {
                    const isMoyskladUnsuccessful =
                      order.moyskladStatusType === "Unsuccessful" ||
                      ["Отменен", "Отклонен", "Удален", "Возврат"].includes(
                        order.moyskladStatus ?? "",
                      );
                    const telegramMessage = [
                      `Здравствуйте! Хочу подтвердить заказ №${order.id.slice(-8).toUpperCase()}.`,
                      `Имя: ${order.contactName ?? "не указано"}`,
                      `Телефон: ${order.phoneNumber}`,
                      "",
                      ...order.items.map(
                        (item, index) =>
                          `${index + 1}. ${item.teaName} — ${item.quantity} шт. × ${item.unitPrice.toLocaleString("ru-RU")} ₽ ${item.teaUnit} = ${(item.quantity * item.unitPrice).toLocaleString("ru-RU")} ₽`,
                      ),
                      "",
                      `Итого: ${order.total.toLocaleString("ru-RU")} ₽`,
                    ].join("\n");
                    const telegramUrl = `https://t.me/mf_administration?text=${encodeURIComponent(telegramMessage)}`;

                    return (
                      <article className="account-order" key={order.id}>
                        <div className="account-order-heading">
                          <div>
                            <strong>
                              Заказ №{order.id.slice(-8).toUpperCase()}
                            </strong>
                            <time dateTime={order.createdAt.toISOString()}>
                              {order.createdAt.toLocaleString("ru-RU", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                          <span className="account-order-status">
                            {order.moyskladStatus
                              ? `МойСклад: ${order.moyskladStatus}`
                              : order.status === "REJECTED"
                                ? "Отклонен магазином"
                                : "Ожидает подтверждения"}
                          </span>
                        </div>
                        <ul>
                          {order.items.map((item) => (
                            <li key={item.id}>
                              <span>
                                {item.teaName} — {item.quantity} ×{" "}
                                {item.unitPrice.toLocaleString("ru-RU")} ₽
                                {item.teaUnit ? ` / ${item.teaUnit}` : ""}
                              </span>
                              <span>
                                {(item.quantity * item.unitPrice).toLocaleString(
                                  "ru-RU",
                                )}{" "}
                                ₽
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="account-order-total">
                          Итого: {order.total.toLocaleString("ru-RU")} ₽
                        </p>
                        {isMoyskladUnsuccessful ||
                        order.status === "REJECTED" ? (
                          <p className="account-order-note">
                            Этот заказ отменён или удалён в МойСклад.
                          </p>
                        ) : order.moyskladSyncRequired &&
                          !order.moyskladOrderId ? (
                          <p className="account-order-note">
                            Заказ пока не зарегистрирован в МойСклад. Вернитесь
                            в каталог и повторите оформление.
                          </p>
                        ) : (
                          <>
                            <p className="account-order-note">
                              Заказ будет принят после отправки сообщения и
                              подтверждения магазином.
                            </p>
                            <a
                              className="account-order-send"
                              href={telegramUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Отправить заказ в Telegram
                            </a>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          }
        />
        <SignOutButton />
      </section>
    </main>
  );
}
