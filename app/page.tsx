import { Suspense } from "react";
import TeaStore from "@/components/TeaStore";
import { connection } from "next/server";
import { getTeas } from "@/lib/teas";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="catalog-empty" aria-busy="true">
          <p>Загружаем каталог…</p>
        </main>
      }
    >
      <TeaCatalog />
    </Suspense>
  );
}

async function TeaCatalog() {
  await connection();
  const teas = await getTeas();
  return <TeaStore teas={teas} />;
}
