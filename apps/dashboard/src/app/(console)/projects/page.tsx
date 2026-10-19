"use client";

import { useEffect, useState } from "react";

import { NewProjectForm } from "@/components/new-project-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjectPage } from "@/lib/api";
import type { Project, ProjectPage } from "@/lib/types";

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

  function handleCreated(project: Project) {
    setPage((current) => {
      if (!current || current.source !== "control-plane") {
        return current;
      }
      const items = [project, ...current.items.filter((row) => row.id !== project.id)];
      return {
        ...current,
        items,
        total: items.length,
        limit: Math.max(items.length, current.limit),
      };
    });
  }

  const rows = page?.items ?? [];
  const canCreate = page?.source === "control-plane";

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Tenants"
        title="Projects"
        description={
          page?.source === "control-plane"
            ? "Live projects through GET and POST /api/console/projects."
            : "Local seed. The server uses the control plane when CONTROL_PLANE_URL is set."
        }
      />
      {canCreate ? <NewProjectForm onCreated={handleCreated} /> : null}
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
                {row.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
