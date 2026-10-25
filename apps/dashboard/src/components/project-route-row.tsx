"use client";

import { Globe, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchRouteDns } from "@/lib/api";
import { formatDnsGuidance, formatDnsTarget } from "@/lib/route-input";
import type { ProjectRoute, RouteDnsRecord } from "@/lib/types";

type ProjectRouteRowProps = {
  route: ProjectRoute;
  canInspectDns: boolean;
  autoLoadDns?: boolean;
};

export function ProjectRouteRow({
  route,
  canInspectDns,
  autoLoadDns = false,
}: ProjectRouteRowProps) {
  const shouldAutoLoad = autoLoadDns && canInspectDns && route.enabled;
  const [dns, setDns] = useState<RouteDnsRecord | null>(null);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [loadingDns, setLoadingDns] = useState(shouldAutoLoad);

  async function handleLoadDns() {
    setDnsError(null);
    setLoadingDns(true);
    try {
      const record = await fetchRouteDns(route.project_id, route.id);
      setDns(record);
    } catch (cause) {
      setDns(null);
      setDnsError(cause instanceof Error ? cause.message : "Failed to load DNS guidance.");
    } finally {
      setLoadingDns(false);
    }
  }

  useEffect(() => {
    if (!shouldAutoLoad) {
      return;
    }
    let cancelled = false;
    fetchRouteDns(route.project_id, route.id)
      .then((record) => {
        if (!cancelled) {
          setDns(record);
          setDnsError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setDns(null);
          setDnsError(cause instanceof Error ? cause.message : "Failed to load DNS guidance.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDns(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [route.id, route.project_id, shouldAutoLoad]);

  return (
    <div className="space-y-2 py-4 first:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 font-mono text-sm break-all">{route.hostname}</p>
        <div className="flex flex-wrap items-center gap-2">
          {canInspectDns && route.enabled ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingDns}
              onClick={() => {
                void handleLoadDns();
              }}
            >
              {loadingDns ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Globe className="size-4" aria-hidden />
              )}
              {loadingDns ? "Loading DNS…" : dns ? "Refresh DNS" : "DNS guidance"}
            </Button>
          ) : null}
          <Badge variant={route.enabled ? "default" : "secondary"}>
            {route.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </div>
      {dns ? (
        <div
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
          role="status"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-foreground">{formatDnsGuidance(dns)}</p>
            <Badge variant={dns.status === "published" ? "default" : "secondary"}>
              {dns.status === "published" ? "Published" : "Unpublished"}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            Point <span className="font-mono text-foreground">{dns.hostname}</span> (
            <span className="font-mono text-foreground">{dns.record_type}</span>) at{" "}
            <span className="font-mono text-foreground">{formatDnsTarget(dns.data)}</span>.
          </p>
        </div>
      ) : null}
      {dnsError ? (
        <p className="text-xs text-destructive" role="alert">
          {dnsError}
        </p>
      ) : null}
    </div>
  );
}
