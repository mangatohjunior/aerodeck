"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchDeployments } from "@/lib/api";
import type { Deployment } from "@/lib/types";

export default function DeploymentsPage() {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDeployments()
      .then(setRows)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load deployments.");
      });
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="History"
        title="Deployments"
        description="In-memory mock list. Restarting next dev clears it."
        actions={
          <Button render={<Link href="/deploy" />}>New deployment</Button>
        }
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <Card>
          <CardContent className="pt-4">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deployments this session. Create one from Deploy.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/deployments/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.owner}/{row.repo}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{row.id}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.started_at).toLocaleString()}
                    </p>
                    <Badge variant="secondary">{row.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
