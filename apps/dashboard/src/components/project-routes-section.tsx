import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ProjectRoute, ProjectSource } from "@/lib/types";

type ProjectRoutesSectionProps = {
  routes: ProjectRoute[];
  source: ProjectSource | undefined;
  loading: boolean;
  /** True when the project itself failed to load. */
  projectUnavailable: boolean;
};

export function ProjectRoutesSection({
  routes,
  source,
  loading,
  projectUnavailable,
}: ProjectRoutesSectionProps) {
  return (
    <section id="routes" className="mt-8 scroll-mt-6">
      <h2 className="mb-3 text-lg font-medium">Routes</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading routes…</p>
      ) : projectUnavailable ? (
        <p className="text-sm text-muted-foreground">Routes are unavailable until the project loads.</p>
      ) : routes.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              {source === "control-plane"
                ? "No routes yet. Hostnames declared on the control plane will show here."
                : "Local seed has no routes. Enroll the console client to list live hostnames."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
            {routes.map((route) => (
              <div
                key={route.id}
                className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-4"
              >
                <p className="min-w-0 font-mono text-sm break-all">{route.hostname}</p>
                <Badge variant={route.enabled ? "default" : "secondary"}>
                  {route.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
