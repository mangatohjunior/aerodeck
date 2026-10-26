import { connection } from "next/server";
import { redirect } from "next/navigation";

import { ConsoleUnavailable } from "@/components/console-unavailable";
import { readSession } from "@/lib/session";

export async function GuestOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const session = await readSession();
  if (session.status === "user") {
    redirect("/");
  }
  if (session.status === "unavailable") {
    return <ConsoleUnavailable />;
  }

  return children;
}
