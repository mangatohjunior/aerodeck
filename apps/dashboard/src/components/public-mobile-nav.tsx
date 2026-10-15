"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { PublicNavLink } from "@/components/public-nav-link";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_AUTH_NAV, PUBLIC_NAV } from "@/lib/public-nav";
import { cn } from "@/lib/utils";

export function PublicMobileNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")}
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="public-mobile-nav"
      >
        <Menu />
      </button>

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
                  className="rounded-lg px-2.5 py-2"
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
