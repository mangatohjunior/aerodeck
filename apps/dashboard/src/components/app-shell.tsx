"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { AppSidebar, type ConsoleView } from "@/components/app-sidebar";
import { DeploymentStatusView } from "@/components/deployment-status";
import { NewDeploymentForm } from "@/components/new-deployment-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Deployment, DeploymentStatus } from "@/lib/mock-deploy";

export function AppShell() {
  const [view, setView] = useState<ConsoleView>("new");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [status, setStatus] = useState<DeploymentStatus>("queued");

  function handleDeployed(next: Deployment) {
    setDeployment(next);
    setStatus("running");
    setView("status");
  }

  function handleNewDeployment() {
    setView("new");
  }

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar
        view={view}
        hasDeployment={deployment !== null}
        mobileOpen={mobileOpen}
        onNavigate={(next) => {
          if (next === "status" && !deployment) {
            return;
          }
          setView(next);
        }}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <p className="text-sm text-muted-foreground">
            {view === "new" ? "Create a deployment" : "Watch provisioner output"}
          </p>
          <Badge variant="outline" className="ml-auto">
            dev · mock
          </Badge>
        </header>

        <main className="flex-1 overflow-auto px-4 py-6 md:px-8 md:py-10">
          {view === "new" || !deployment ? (
            <NewDeploymentForm onDeployed={handleDeployed} />
          ) : (
            <DeploymentStatusView
              deployment={deployment}
              status={status}
              onStreamComplete={() => setStatus("succeeded")}
              onNewDeployment={handleNewDeployment}
            />
          )}
        </main>
      </div>
    </div>
  );
}
