import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ConsoleUnavailable } from "@/components/console-unavailable";
import { readControlPlaneConfig } from "@/lib/control-plane";
import { readSession } from "@/lib/session";

export async function ConsoleSession({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (session.status === "anonymous") {
    redirect("/login");
  }
  if (session.status === "unavailable") {
    return <ConsoleUnavailable />;
  }

  return (
    <AppShell user={session.user} controlPlane={readControlPlaneConfig() !== null}>
      {children}
    </AppShell>
  );
}
