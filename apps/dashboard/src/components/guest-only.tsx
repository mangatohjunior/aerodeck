import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";

export async function GuestOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (user) {
    redirect("/");
  }

  return children;
}
