"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_AUTH_NAV, PUBLIC_NAV } from "@/lib/public-nav";
import { cn } from "@/lib/utils";

export function PublicShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border">
        <div className="flex h-14 w-full items-center gap-3 px-4 md:px-8">
          <Link href="/about" className="flex items-center gap-2.5">
            <BrandMark className="size-8 text-primary" />
            <span className="text-sm font-semibold tracking-tight">AeroDeck</span>
          </Link>

          <nav aria-label="Public" className="ml-6 hidden items-center gap-4 md:flex">
            {PUBLIC_NAV.map((item) => (
              <PublicNavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
            ))}
          </nav>

          <nav aria-label="Account" className="ml-auto hidden items-center gap-4 md:flex">
            {PUBLIC_AUTH_NAV.map((item) => (
              <PublicNavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
            ))}
          </nav>

          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "ml-auto md:hidden")}
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="public-mobile-nav"
          >
            <Menu />
          </button>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div
            id="public-mobile-nav"
            className="relative z-10 flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <p className="text-sm font-semibold">AeroDeck</p>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X />
              </button>
            </div>
            <nav aria-label="Public" className="flex flex-col gap-1 p-3">
              {PUBLIC_NAV.map((item) => (
                <PublicNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  pathname={pathname}
                  className="rounded-lg px-2.5 py-2"
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
            <nav aria-label="Account" className="flex flex-col gap-1 p-3">
              {PUBLIC_AUTH_NAV.map((item) => (
                <PublicNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  pathname={pathname}
                  className="rounded-lg px-2.5 py-2"
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <main className="console-canvas flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="flex w-full flex-col gap-3 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-end md:justify-between md:px-8">
          <div className="flex flex-col gap-1">
            <p>AeroDeck · GitOps on DigitalOcean</p>
            <p>Local mock UI. No FastAPI and no cloud apply from this page.</p>
          </div>
          <nav aria-label="Legal" className="flex items-center gap-4">
            {PUBLIC_NAV.map((item) => (
              <PublicNavLink
                key={`footer-${item.href}`}
                href={item.href}
                label={item.label}
                pathname={pathname}
                className="text-xs"
              />
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

function PublicNavLink({
  href,
  label,
  pathname,
  className,
  onClick,
}: {
  href: string;
  label: string;
  pathname: string;
  className?: string;
  onClick?: () => void;
}) {
  const active = pathname === href || pathname.startsWith(`${href}/`);

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
