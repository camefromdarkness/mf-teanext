"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

type SignInOptionsProps = {
  redirectTo: string;
  vkReady: boolean;
  telegramReady: boolean;
};

export default function SignInOptions({
  redirectTo,
  vkReady,
  telegramReady,
}: SignInOptionsProps) {
  const [error, setError] = useState("");

  async function handleSignIn(provider: "vkid" | "telegram") {
    setError("");
    try {
      await signIn(provider, { redirectTo });
    } catch (signInError) {
      console.error("Не удалось начать вход.", signInError);
      setError("Не удалось начать вход. Попробуйте ещё раз.");
    }
  }

  return (
    <div className="signin-options">
      <button
        type="button"
        className="signin-provider signin-vk"
        disabled={!vkReady}
        onClick={() => handleSignIn("vkid")}
      >
        <span className="signin-provider-icon" aria-hidden="true">
          VK
        </span>
        <span>Войти через VK ID</span>
      </button>
      <button
        type="button"
        className="signin-provider signin-telegram"
        disabled={!telegramReady}
        onClick={() => handleSignIn("telegram")}
      >
        <svg
          className="signin-provider-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="currentColor"
        >
          <path d="M21.4 4.1 18.2 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.6.6-1.2.6l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L5.4 13.6.5 12c-1.1-.3-1.1-1 .2-1.5L19.8 3c.9-.3 1.7.2 1.6 1.1Z" />
        </svg>
        <span>Войти через Telegram</span>
      </button>
      {(!vkReady || !telegramReady) && (
        <p className="signin-setup-note">
          Вход станет доступен после настройки приложений VK ID и Telegram
          на сервере.
        </p>
      )}
      {error && (
        <p className="signin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
