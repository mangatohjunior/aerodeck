"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EnvironmentEditRow } from "@/components/environment-edit-row";
import { NewEnvironmentForm } from "@/components/new-environment-form";
import { PageHeader } from "@/components/page-header";
import { ProjectEditPanel } from "@/components/project-edit-panel";
import { ProjectRoutesSection } from "@/components/project-routes-section";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjectDetail } from "@/lib/api";
import { mergeEnvironmentsById } from "@/lib/environment-list";
import type { EnvironmentOption, Project, ProjectDetail } from "@/lib/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = typeof params.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setDetail(null);
      setError("Project was not found.");
      setLoading(false);
      return;
    }
    // Drop prior detail immediately so edit/delete cannot target another project
    // while this route's fetch is still in flight.
    setLoading(true);
    setDetail(null);
    setError(null);
    fetchProjectDetail(projectId)
      .then((next) => {
        if (cancelled || next.project.id !== projectId) {
          return;
        }
        setDetail(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setDetail(null);
        setError(cause instanceof Error ? cause.message : "Failed to load project.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (loading || !detail) {
      return;
    }
    const hash = window.location.hash;
    if (hash === "#environments") {
      document.getElementById("environments")?.scrollIntoView();
      return;
    }
    if (hash === "#routes") {
      document.getElementById("routes")?.scrollIntoView();
    }
  }, [loading, detail]);

  function handleProjectUpdated(project: Project) {
    setDetail((current) => (current ? { ...current, project } : current));
  }

  function handleEnvironmentCreated(environment: EnvironmentOption) {
    setDetail((current) => {
      if (!current || current.source !== "control-plane") {
        return current;
      }
      return {
        ...current,
        environments: mergeEnvironmentsById([environment], current.environments),
      };
    });
  }

  function handleEnvironmentUpdated(environment: EnvironmentOption) {
    setDetail((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        environments: current.environments.map((row) =>
          row.id === environment.id ? environment : row,
        ),
      };
    });
  }

  function handleEnvironmentDeleted(environmentId: string) {
    setDetail((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        environments: current.environments.filter((row) => row.id !== environmentId),
      };
    });
  }

  const project = detail?.project;
  const environments = detail?.environments ?? [];
  const routes = detail?.routes ?? [];
  const detailReady = !loading && project != null && project.id === projectId;
  const canMutate = detailReady && detail?.source === "control-plane";

  return (
    <div className="mx-auto w-full max-w-4xl">
      <p className="mb-4 text-sm text-muted-foreground">
        <Link href="/projects" className="text-primary hover:underline">
          ← Projects
        </Link>
      </p>
      <PageHeader
        eyebrow="Tenant"
        title={project?.name ?? "Project"}
        description={
          detail?.source === "control-plane"
            ? "Live project, environments, and routes from the control plane."
            : detail?.source === "mock"
              ? "Local seed project. Environments and routes are not stored in the mock catalog."
              : loading
                ? "Loading project…"
                : "Project detail."
        }
      />
      {error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {canMutate && project ? (
        <ProjectEditPanel project={project} onUpdated={handleProjectUpdated} />
      ) : null}
      {detailReady && !canMutate && project ? (
        <Card className="mb-6">
          <CardContent className="space-y-2 pt-6">
            <p className="font-mono text-sm text-primary">{project.slug}</p>
            {project.description ? (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
      {canMutate && project ? (
        <NewEnvironmentForm projects={[project]} onCreated={handleEnvironmentCreated} />
      ) : null}
      <section id="environments" className="scroll-mt-6">
        <h2 className="mb-3 text-lg font-medium">Environments</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading environments…</p>
        ) : error && !project ? (
          <p className="text-sm text-muted-foreground">Environments are unavailable until the project loads.</p>
        ) : environments.length === 0 ? (
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-muted-foreground">
                {detail?.source === "control-plane"
                  ? "No environments yet. Create one above so Deploy can provision."
                  : "Local seed has no environments. Enroll the console client to manage live ones."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border pt-0">
              {environments.map((env) =>
                canMutate ? (
                  <EnvironmentEditRow
                    key={env.id}
                    environment={env}
                    onUpdated={handleEnvironmentUpdated}
                    onDeleted={handleEnvironmentDeleted}
                  />
                ) : (
                  <div key={env.id} className="py-4 first:pt-4">
                    <p className="font-medium">{env.name}</p>
                    <p className="font-mono text-xs text-primary">
                      {env.slug} ({env.kind}, {env.region})
                    </p>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        )}
      </section>
      <ProjectRoutesSection
        routes={routes}
        source={detail?.source}
        loading={loading}
        projectUnavailable={Boolean(error && !project)}
      />
    </div>
  );
}
