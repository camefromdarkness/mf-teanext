"use client";

import { useEffect, useState } from "react";

type StaffRole = "MANAGER" | "ADMIN" | "SUPER_ADMIN";
type UserRole = "CUSTOMER" | StaffRole;
type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  role: UserRole;
  createdAt: string;
};

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return body?.error ?? "Не удалось выполнить запрос.";
}

function roleName(role: UserRole) {
  return {
    CUSTOMER: "Покупатель",
    MANAGER: "Менеджер",
    ADMIN: "Администратор",
    SUPER_ADMIN: "Супер-администратор",
  }[role];
}

export default function AdminUsersPanel({
  role,
  currentUserId,
}: {
  role: Exclude<UserRole, "CUSTOMER">;
  currentUserId: string;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const isSuperAdmin = role === "SUPER_ADMIN";

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        const result: unknown = await response.json();
        if (!Array.isArray(result)) {
          throw new Error("Сервер вернул некорректный список пользователей.");
        }
        if (active) setUsers(result as AdminUser[]);
      })
      .catch((requestError: unknown) => {
        console.error("Не удалось загрузить пользователей.", requestError);
        if (active) setError("Не удалось загрузить список пользователей.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function changeRole(userId: string, nextRole: UserRole) {
    setBusyUserId(userId);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const updated = (await response.json()) as AdminUser;
      setUsers((current) =>
        current.map((user) => (user.id === updated.id ? updated : user)),
      );
    } catch (requestError) {
      console.error("Не удалось изменить роль пользователя.", requestError);
      setError("Не удалось изменить роль пользователя.");
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <section className="admin-users" role="tabpanel" id="admin-users-panel">
      <div className="admin-orders-heading">
        <div>
          <h2>Пользователи</h2>
          <p>
            {isSuperAdmin
              ? "Просмотр аккаунтов и управление ролями сотрудников."
              : "Просмотр аккаунтов и назначение менеджеров."}
          </p>
        </div>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading ? (
        <p role="status">Загружаем пользователей…</p>
      ) : users.length === 0 ? (
        <p className="admin-orders-empty">Пользователей пока нет.</p>
      ) : (
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Телефон</th>
                <th>Дата регистрации</th>
                <th>Роль</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name || "Без имени"}</strong>
                    {user.email && <small>{user.email}</small>}
                  </td>
                  <td>{user.phoneNumber || "—"}</td>
                  <td>
                    {new Date(user.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td>
                    {user.role === "SUPER_ADMIN" ||
                    user.id === currentUserId ||
                    (!isSuperAdmin && user.role === "ADMIN") ? (
                      <span>{roleName(user.role)}</span>
                    ) : (
                      <select
                        aria-label={`Роль пользователя ${user.name ?? user.id}`}
                        value={user.role}
                        disabled={busyUserId === user.id}
                        onChange={(event) =>
                          void changeRole(user.id, event.target.value as UserRole)
                        }
                      >
                        <option value="CUSTOMER">Покупатель</option>
                        <option value="MANAGER">Менеджер</option>
                        {isSuperAdmin && (
                          <option value="ADMIN">Администратор</option>
                        )}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
