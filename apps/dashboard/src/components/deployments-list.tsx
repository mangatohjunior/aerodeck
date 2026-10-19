"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DeploymentEnvironmentLink } from "@/components/deployment-environment-link";
import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchDeployments, fetchEnvironments } from "@/lib/api";
import { formatInstant } from "@/lib/format";
import type { Deployment, EnvironmentOption } from "@/lib/types";

export function DeploymentsList({ controlPlane = false }: { controlPlane?: boolean }) {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeployments(controlPlane)
      .then((items) => {
        if (!cancelled) {
          setRows(items);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load deployments.");
        }
      });
    if (controlPlane) {
      fetchEnvironments()
        .then((page) => {
          if (!cancelled) {
            setEnvironments(page.items);
          }
        })
        .catch((cause: unknown) => {
          console.warn(
            "event=deployment_environment_catalog_failed detail=%s",
            cause instanceof Error ? cause.message : "request failed",
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [controlPlane]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="History"
        title="Deployments"
        description={
          controlPlane
            ? "Stored by the control plane. A dashboard restart keeps this list."
            : "In-memory mock list. Restarting next dev clears it."
        }
        actions={<LinkButton href="/deploy">New deployment</LinkButton>}
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
                {controlPlane
                  ? "No deployments yet. Create one from Deploy."
                  : "No deployments this session. Create one from Deploy."}
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
                      <DeploymentEnvironmentLink deployment={row} environments={environments} />
                    </div>
                    <p className="text-xs text-muted-foreground">{formatInstant(row.started_at)}</p>
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
