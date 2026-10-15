"use client";

import { LogOut, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { fetchMe, logoutAccount } from "@/lib/api";
import type { PublicUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((next) => {
        if (!cancelled) {
          setUser(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logoutAccount();
    } catch {
      // Cookie clear still happens on 204; treat any failure as signed out.
    }
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-8">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")}
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <p className="text-sm text-muted-foreground">
            GitOps operator console
          </p>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {user ? (
              <>
                <p className="max-w-[10rem] truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  <LogOut data-icon="inline-start" />
                  Sign out
                </Button>
              </>
            ) : null}
            <Badge variant="outline" className="border-runway/40 text-runway">
              local · mock
            </Badge>
          </div>
        </header>

        <main className="console-canvas flex-1 overflow-auto px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
