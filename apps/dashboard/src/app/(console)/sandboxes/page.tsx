"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchSandboxes } from "@/lib/api";
import type { Sandbox } from "@/lib/types";

export default function SandboxesPage() {
  const [rows, setRows] = useState<Sandbox[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSandboxes()
      .then(setRows)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load sandboxes.");
      });
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Runtime"
        title="Sandboxes"
        description="Mock Firecracker guests. These rows do not boot a microVM."
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
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
