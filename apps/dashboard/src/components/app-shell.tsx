"use client";

import { LogOut, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { fetchMe, logoutAccount, SessionEnded } from "@/lib/api";
import type { PublicUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  user,
  controlPlane = false,
}: {
  children: React.ReactNode;
  user: PublicUser;
  controlPlane?: boolean;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    fetchMe().catch(async (cause: unknown) => {
      if (cancelled || !(cause instanceof SessionEnded)) {
        return;
      }
      try {
        await logoutAccount();
      } catch {
        // The session is already gone. Leave the cookie for the next read.
      }
      router.replace("/login");
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logoutAccount();
    } catch {
      setSigningOut(false);
      setSignOutError("Sign out did not finish. Try again.");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        controlPlane={controlPlane}
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
            <p className="max-w-[10rem] truncate text-xs text-muted-foreground">
              {currentUser.email}
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
            {signOutError ? (
              <p className="max-w-[12rem] text-xs text-destructive" role="alert">
                {signOutError}
              </p>
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
