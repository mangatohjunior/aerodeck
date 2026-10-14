"use client";

import {
  Activity,
  Box,
  FolderGit2,
  Rocket,
  Settings,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type ConsoleView = "new" | "status";

const NAV = [
  { id: "new" as const, label: "New Deployment", icon: Rocket },
  { id: "status" as const, label: "Deployment Status", icon: Activity },
] as const;

const PLACEHOLDER = [
  { label: "Projects", icon: FolderGit2 },
  { label: "Sandboxes", icon: Box },
  { label: "Settings", icon: Settings },
] as const;

type AppSidebarProps = {
  view: ConsoleView;
  hasDeployment: boolean;
  mobileOpen: boolean;
  onNavigate: (view: ConsoleView) => void;
  onCloseMobile: () => void;
};

export function AppSidebar({
  view,
  hasDeployment,
  mobileOpen,
  onNavigate,
  onCloseMobile,
}: AppSidebarProps) {
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
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              A
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">AeroDeck</p>
              <p className="text-[11px] text-muted-foreground">GitOps console</p>
            </div>
          </div>
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
          {NAV.map((item) => {
            const Icon = item.icon;
            const disabled = item.id === "status" && !hasDeployment;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </button>
            );
          })}

          <p className="mt-4 mb-1 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Platform
          </p>
          {PLACEHOLDER.map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/45"
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
                <span className="ml-auto text-[10px] tracking-wide uppercase">
                  soon
                </span>
              </span>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <p className="text-[11px] text-muted-foreground">
            Mock mode · no control-plane API
          </p>
        </div>
      </aside>
    </>
  );
}
