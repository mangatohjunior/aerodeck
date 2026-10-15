"use client";

import { useSearchParams } from "next/navigation";

export function LoginStatus() {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";

  if (!registered) {
    return null;
  }

  return (
    <p className="text-sm text-primary" role="status">
      Account created. Sign in with that email.
    </p>
  );
}
