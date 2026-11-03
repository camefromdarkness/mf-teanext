import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOON FLOWER — китайский чай",
  description:
    "Коллекция китайского чая MOON FLOWER: улуны, красный чай и ГАБА. Выберите свой вкус и оформите заказ.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
