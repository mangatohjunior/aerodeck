"use client";

import { useSearchParams } from "next/navigation";

import { CardContent } from "@/components/ui/card";

export function LoginStatus() {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";

  return (
    <CardContent className="pt-4">
      {registered ? (
        <p className="text-sm text-primary" role="status">
          Account created. Sign in with that email once Login is wired.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Create an account first if you do not have one.
        </p>
      )}
    </CardContent>
  );
}
