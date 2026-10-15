"use client";

import {
  Activity,
  Box,
  FolderGit2,
  LayoutDashboard,
  Rocket,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/deploy", label: "New Deployment", icon: Rocket },
  { href: "/deployments", label: "Deployments", icon: Activity },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/sandboxes", label: "Sandboxes", icon: Box },
] as const;

type AppSidebarProps = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function AppSidebar({ mobileOpen, onCloseMobile }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2.5" onClick={onCloseMobile}>
            <BrandMark className="size-8 text-primary" />
            <div>
              <p className="text-sm font-semibold tracking-tight">AeroDeck</p>
              <p className="text-[11px] text-muted-foreground">Flight-deck console</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
          >
            <X />
          </Button>
        </div>

        <Separator />

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <p className="mb-1 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Operate
          </p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <p className="text-[11px] text-muted-foreground">
            Mock API · <span className="font-mono text-primary/80">/api/mock/v1</span>
          </p>
        </div>
      </aside>
    </>
  );
}
