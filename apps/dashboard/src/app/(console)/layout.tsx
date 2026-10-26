import { Suspense } from "react";

import { ConsoleSession } from "@/components/console-session";


function ConsoleFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Checking session…</p>
    </div>
  );
}

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ConsoleFallback />}>
      <ConsoleSession>{children}</ConsoleSession>
    </Suspense>
  );
}
