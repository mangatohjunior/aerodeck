import type { Metadata } from "next";

import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: {
    default: "AeroDeck",
    template: "%s · AeroDeck",
  },
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
