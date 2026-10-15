"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const emptySubscribe = () => () => undefined;

function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export function PublicNavLink({
  href,
  label,
  className,
  onClick,
}: {
  href: string;
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isClient = useIsClient();
  const active =
    isClient && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-sm transition-colors",
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {label}
    </Link>
  );
}
