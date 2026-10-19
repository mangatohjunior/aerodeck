"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { NewEnvironmentForm } from "@/components/new-environment-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjectDetail } from "@/lib/api";
import { mergeEnvironmentsById } from "@/lib/environment-list";
import type { EnvironmentOption, ProjectDetail } from "@/lib/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = typeof params.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!projectId) {
      setError("Project was not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchProjectDetail(projectId)
      .then((next) => {
        setDetail(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        setDetail(null);
        setError(cause instanceof Error ? cause.message : "Failed to load project.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const project = detail?.project;
  const environments = detail?.environments ?? [];
  const canCreate = detail?.source === "control-plane" && project;

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
            ? "Project detail through GET /api/console/projects/{id}."
            : detail?.source === "mock"
              ? "Local seed project. Environments are not stored in the mock catalog."
              : "Loading project…"
        }
      />
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {project ? (
        <>
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
          {canCreate ? (
            <NewEnvironmentForm projects={[project]} onCreated={handleEnvironmentCreated} />
          ) : null}
          <section id="environments" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-medium">Environments</h2>
            {environments.length === 0 ? (
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
                  {environments.map((env) => (
                    <div key={env.id} className="py-4 first:pt-4">
                      <p className="font-medium">{env.name}</p>
                      <p className="font-mono text-xs text-primary">
                        {env.slug} ({env.kind}, {env.region})
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
