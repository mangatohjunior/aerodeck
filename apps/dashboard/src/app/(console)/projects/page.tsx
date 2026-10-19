"use client";

import { useEffect, useState } from "react";

import { NewEnvironmentForm } from "@/components/new-environment-form";
import { NewProjectForm } from "@/components/new-project-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjectPage } from "@/lib/api";
import type { EnvironmentOption, Project, ProjectPage } from "@/lib/types";

export default function ProjectsPage() {
  const [page, setPage] = useState<ProjectPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdEnvironments, setCreatedEnvironments] = useState<EnvironmentOption[]>([]);

  useEffect(() => {
    fetchProjectPage()
      .then(setPage)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load projects.");
      });
  }, []);

  function handleProjectCreated(project: Project) {
    setPage((current) => {
      if (!current || current.source !== "control-plane") {
        return current;
      }
      const alreadyListed = current.items.some((row) => row.id === project.id);
      const items = [project, ...current.items.filter((row) => row.id !== project.id)];
      return {
        ...current,
        items,
        total: alreadyListed ? current.total : current.total + 1,
      };
    });
  }

  function handleEnvironmentCreated(environment: EnvironmentOption) {
    setCreatedEnvironments((current) => {
      if (current.some((row) => row.id === environment.id)) {
        return current;
      }
      return [environment, ...current];
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
            ? "Live projects and environments through /api/console/projects and /api/console/environments."
            : "Local seed. The server uses the control plane when CONTROL_PLANE_URL is set."
        }
      />
      {canCreate ? <NewProjectForm onCreated={handleProjectCreated} /> : null}
      {canCreate ? (
        <NewEnvironmentForm projects={rows} onCreated={handleEnvironmentCreated} />
      ) : null}
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
            {rows.map((row) => {
              const envs = createdEnvironments.filter((env) => env.project_id === row.id);
              return (
                <div key={row.id} className="py-4 first:pt-4">
                  <p className="font-medium">{row.name}</p>
                  <p className="font-mono text-xs text-primary">{row.slug}</p>
                  {row.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                  ) : null}
                  {envs.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {envs.map((env) => (
                        <li key={env.id} className="font-mono text-xs">
                          {env.slug} ({env.kind}, {env.region})
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
