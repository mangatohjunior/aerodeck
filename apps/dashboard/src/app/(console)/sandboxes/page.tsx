"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { NewSandboxForm } from "@/components/new-sandbox-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjectPage, fetchSandboxPage } from "@/lib/api";
import {
  formatSandboxExpiry,
  groupSandboxesByProject,
  isSandboxExpired,
  type SandboxProjectGroup,
} from "@/lib/sandbox-group";
import { mergeSandboxesById } from "@/lib/sandbox-input";
import type { Project, Sandbox, SandboxPage } from "@/lib/types";

function SandboxesEmptyState({
  canCreate,
  hasProjects,
}: {
  canCreate: boolean;
  hasProjects: boolean;
}) {
  if (!canCreate) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No sandboxes in the local seed.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <p className="text-sm text-muted-foreground">
        No sandboxes running yet.{" "}
        {hasProjects
          ? "Use the New sandbox form above to boot a short-lived Firecracker microVM."
          : "Create a project first, then boot a Firecracker microVM from this page."}
      </p>
      {hasProjects ? (
        <a
          href="#sandbox-image"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Jump to New sandbox
        </a>
      ) : (
        <Link
          href="/projects"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to Projects
        </Link>
      )}
    </div>
  );
}

function SandboxGroupSection({ group }: { group: SandboxProjectGroup }) {
  return (
    <div className="py-4 first:pt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            href={`/projects/${group.projectId}`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {group.projectName}
          </Link>
          {group.projectSlug ? (
            <span className="font-mono text-xs text-muted-foreground">
              {group.projectSlug}
            </span>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          {group.sandboxes.length}{" "}
          {group.sandboxes.length === 1 ? "sandbox" : "sandboxes"}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {group.sandboxes.map((row) => {
          const expired = isSandboxExpired(row.expires_at);
          return (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm">{row.image}</p>
                <p className="text-xs text-muted-foreground">
                  {row.vcpu} vCPU · {row.memory_mib} MiB · TTL {row.ttl_seconds}s
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Expires{" "}
                  <span className="font-mono text-foreground">
                    {formatSandboxExpiry(row.expires_at)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {expired && row.status === "running" ? (
                  <Badge variant="outline">TTL elapsed</Badge>
                ) : null}
                <Badge variant={row.status === "running" ? "default" : "secondary"}>
                  {row.status}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SandboxesPage() {
  const [page, setPage] = useState<SandboxPage | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSandboxPage()
      .then(async (sandboxPage) => {
        if (cancelled) {
          return;
        }
        setPage(sandboxPage);
        if (sandboxPage.source !== "control-plane") {
          return;
        }
        try {
          const projectPage = await fetchProjectPage();
          if (!cancelled && projectPage.source === "control-plane") {
            setProjects(projectPage.items);
          }
        } catch {
          // Keep sandboxes visible even if the project selector list fails to load.
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load sandboxes.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSandboxCreated(sandbox: Sandbox) {
    setPage((current) => {
      if (!current || current.source !== "control-plane") {
        return current;
      }
      const items = mergeSandboxesById([sandbox], current.items);
      return {
        ...current,
        items,
        total: items.length,
        limit: Math.max(items.length, 1),
      };
    });
  }

  const rows = page?.items ?? [];
  const canCreate = page?.source === "control-plane";
  const groups = groupSandboxesByProject(rows, projects);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Runtime"
        title="Sandboxes"
        description={
          page?.source === "control-plane"
            ? "Live guests from GET /api/v1/projects/{id}/sandboxes, grouped by project."
            : "Local seed grouped by project. The server uses the control plane when CONTROL_PLANE_URL is set."
        }
      />
      {canCreate ? (
        <NewSandboxForm projects={projects} onCreated={handleSandboxCreated} />
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
            {page && groups.length === 0 ? (
              <SandboxesEmptyState
                canCreate={canCreate}
                hasProjects={projects.length > 0}
              />
            ) : null}
            {groups.map((group) => (
              <SandboxGroupSection key={group.projectId} group={group} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
