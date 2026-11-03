import { Suspense } from "react";
import { connection } from "next/server";
import AdminPanel from "@/components/AdminPanel";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAllTeas } from "@/lib/teas";

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="admin-page">
          <p>Загрузка панели…</p>
        </main>
      }
    >
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
  await connection();
  const authenticated = await isAdminAuthenticated();
  const teas = authenticated ? await getAllTeas() : [];
  return (
    <AdminPanel
      key={authenticated ? "admin" : "guest"}
      authenticated={authenticated}
      initialTeas={teas}
    />
  );
}
