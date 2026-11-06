import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";
import { getStaffUser } from "@/lib/admin-auth";
import { getAllTeas } from "@/lib/teas";

export const metadata = {
  title: "Админ-панель",
  robots: { index: false, follow: false },
};

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
  const staff = await getStaffUser();
  if (!staff) redirect("/account");
  const teas = await getAllTeas();
  return (
    <AdminPanel
      key={staff.role}
      role={staff.role}
      currentUserId={staff.id}
      initialTeas={teas}
    />
  );
}
