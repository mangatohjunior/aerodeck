"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchSandboxPage } from "@/lib/api";
import type { SandboxPage } from "@/lib/types";

export default function SandboxesPage() {
  const [page, setPage] = useState<SandboxPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSandboxPage()
      .then(setPage)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load sandboxes.");
      });
  }, []);

  const rows = page?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Runtime"
        title="Sandboxes"
        description={
          page?.source === "control-plane"
            ? "Live guests from GET /api/v1/projects/{id}/sandboxes."
            : "Local seed. The server uses the control plane when CONTROL_PLANE_URL is set."
        }
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
            {page && rows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No sandboxes yet.</p>
            ) : null}
            {rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm">{row.image}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.vcpu} vCPU · {row.memory_mib} MiB · TTL {row.ttl_seconds}s
                  </p>
                </div>
                <Badge variant={row.status === "running" ? "default" : "secondary"}>
                  {row.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
