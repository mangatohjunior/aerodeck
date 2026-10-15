"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjects } from "@/lib/api";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [rows, setRows] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects()
      .then(setRows)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load projects.");
      });
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Tenants"
        title="Projects"
        description="Seeded from the mock catalog. Shape matches GET /api/v1/projects on the control plane."
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
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
