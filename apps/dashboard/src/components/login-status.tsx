"use client";

import { useSearchParams } from "next/navigation";

export function LoginStatus() {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";
  const googleFailed = searchParams.get("google") === "error";

  if (googleFailed) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Google sign-in was cancelled or failed. Try email and password, or Continue
        with Google again.
      </p>
    );
  }

  if (!registered) {
    return null;
  }

  return (
    <p className="text-sm text-primary" role="status">
      Account created. Sign in with that email, or Continue with Google if it is
      the same address.
    </p>
  );
}
