import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { PublicMobileNav } from "@/components/public-mobile-nav";
import { PublicNavLink } from "@/components/public-nav-link";
import { PUBLIC_AUTH_NAV, PUBLIC_NAV } from "@/lib/public-nav";

export function PublicShell({ children }: { children: React.ReactNode }) {
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
              <PublicNavLink key={item.href} href={item.href} label={item.label} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <nav aria-label="Account" className="hidden items-center gap-4 md:flex">
              {PUBLIC_AUTH_NAV.map((item) => (
                <PublicNavLink key={item.href} href={item.href} label={item.label} />
              ))}
            </nav>
            <PublicMobileNav />
          </div>
        </div>
      </header>

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
                className="text-xs"
              />
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
