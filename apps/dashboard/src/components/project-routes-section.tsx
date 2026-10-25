"use client";

import { useState } from "react";

import { NewRouteForm } from "@/components/new-route-form";
import { ProjectRouteRow } from "@/components/project-route-row";
import { Card, CardContent } from "@/components/ui/card";
import type { EnvironmentOption, ProjectRoute, ProjectSource } from "@/lib/types";

type ProjectRoutesSectionProps = {
  projectId?: string;
  environments?: EnvironmentOption[];
  routes: ProjectRoute[];
  source: ProjectSource | undefined;
  loading: boolean;
  /** True when the project itself failed to load. */
  projectUnavailable: boolean;
  /** True when the control-plane routes list failed (not an empty list). */
  routesUnavailable: boolean;
  onRouteCreated?: (route: ProjectRoute) => void;
};

export function ProjectRoutesSection({
  projectId,
  environments = [],
  routes,
  source,
  loading,
  projectUnavailable,
  routesUnavailable,
  onRouteCreated,
}: ProjectRoutesSectionProps) {
  const [lastCreatedRouteId, setLastCreatedRouteId] = useState<string | null>(null);
  const canMutate = !loading && !projectUnavailable && source === "control-plane" && Boolean(projectId);

  function handleCreated(route: ProjectRoute) {
    setLastCreatedRouteId(route.id);
    onRouteCreated?.(route);
  }

  return (
    <section id="routes" className="mt-8 scroll-mt-6">
      <h2 className="mb-3 text-lg font-medium">Routes</h2>
      {canMutate && projectId ? (
        <NewRouteForm
          projectId={projectId}
          environments={environments}
          onCreated={handleCreated}
        />
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading routes…</p>
      ) : projectUnavailable ? (
        <p className="text-sm text-muted-foreground">Routes are unavailable until the project loads.</p>
      ) : routesUnavailable ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive" role="alert">
              Routes could not be loaded. Refresh to try again.
            </p>
          </CardContent>
        </Card>
      ) : routes.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              {source === "control-plane"
                ? "No routes yet. Declare a hostname above to publish a route."
                : "Local seed has no routes. Enroll the console client to list live hostnames."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
            {routes.map((route) => (
              <ProjectRouteRow
                key={route.id}
                route={route}
                canInspectDns={source === "control-plane"}
                autoLoadDns={route.id === lastCreatedRouteId}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
