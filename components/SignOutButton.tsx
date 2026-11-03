"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      className="account-signout"
      onClick={() => signOut({ redirectTo: "/" })}
    >
      Выйти
    </button>
  );
}
