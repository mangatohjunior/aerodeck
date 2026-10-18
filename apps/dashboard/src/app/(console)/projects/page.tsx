"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjectPage } from "@/lib/api";
import type { ProjectPage } from "@/lib/types";

export default function ProjectsPage() {
  const [page, setPage] = useState<ProjectPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjectPage()
      .then(setPage)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load projects.");
      });
  }, []);

  const rows = page?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Tenants"
        title="Projects"
        description={
          page?.source === "control-plane"
            ? "Live projects from GET /api/v1/projects."
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
              <p className="py-4 text-sm text-muted-foreground">No projects yet.</p>
            ) : null}
            {rows.map((row) => (
              <div key={row.id} className="py-4 first:pt-4">
                <p className="font-medium">{row.name}</p>
                <p className="font-mono text-xs text-primary">{row.slug}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
