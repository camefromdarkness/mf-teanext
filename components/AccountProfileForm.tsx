"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatRussianPhoneInput,
  normalizeRussianPhone,
} from "@/lib/phone";

type AccountProfileFormProps = {
  name: string;
  phoneNumber: string;
  publicId: string;
};

type ProfileResponse = {
  name: string | null;
  phoneNumber: string | null;
  error?: string;
};

export default function AccountProfileForm({
  name: initialName,
  phoneNumber: initialPhoneNumber,
  publicId,
}: AccountProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phoneNumber, setPhoneNumber] = useState(
    formatRussianPhoneInput(initialPhoneNumber),
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phoneNumber }),
      });
      const result = (await response.json()) as ProfileResponse;
      if (!response.ok) {
        setMessage(result.error ?? "Не удалось сохранить профиль.");
        return;
      }

      setName(result.name ?? "");
      setPhoneNumber(formatRussianPhoneInput(result.phoneNumber ?? ""));
      setMessage("Профиль сохранён.");
      router.refresh();
    } catch (error) {
      console.error("Не удалось отправить изменения профиля.", error);
      setMessage("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicId() {
    try {
      await navigator.clipboard.writeText(publicId);
      setMessage("UUID скопирован.");
    } catch (error) {
      console.error("Не удалось скопировать UUID.", error);
      setMessage("Не удалось скопировать UUID. Выделите его вручную.");
    }
  }

  return (
    <>
      <form className="account-form" onSubmit={saveProfile}>
        <label>
          Имя
          <input
            autoComplete="name"
            maxLength={120}
            name="name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label>
          Номер телефона
          <input
            autoComplete="tel"
            inputMode="tel"
            maxLength={18}
            name="phoneNumber"
            onChange={(event) =>
              setPhoneNumber(formatRussianPhoneInput(event.target.value))
            }
            onBlur={() => {
              const normalized = normalizeRussianPhone(phoneNumber);
              if (normalized) {
                setPhoneNumber(formatRussianPhoneInput(normalized));
              }
            }}
            placeholder="+7 999 123-45-67"
            type="tel"
            value={phoneNumber}
          />
          <span className="account-field-hint">
            Введите российский номер с +7, 8 или без кода страны. Мы приведём
            его к формату +7 (999) 123-45-67. Telegram не передаёт номер
            автоматически.
          </span>
        </label>
        <div className="account-uuid">
          <span>Ваш UUID</span>
          <code>{publicId}</code>
          <button type="button" onClick={copyPublicId}>
            Скопировать
          </button>
        </div>
        <button className="account-save" type="submit" disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить профиль"}
        </button>
        {message && (
          <p className="account-form-message" role="status">
            {message}
          </p>
        )}
      </form>
    </>
  );
}
