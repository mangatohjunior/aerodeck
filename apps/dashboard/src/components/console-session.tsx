import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/session";

export async function ConsoleSession({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
