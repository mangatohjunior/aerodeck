"use client";

import { useEffect, useState } from "react";

import { NewSandboxForm } from "@/components/new-sandbox-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProjectPage, fetchSandboxPage } from "@/lib/api";
import { mergeSandboxesById } from "@/lib/sandbox-input";
import type { Project, Sandbox, SandboxPage } from "@/lib/types";

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

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow="Runtime"
        title="Sandboxes"
        description={
          page?.source === "control-plane"
            ? "Live guests from GET /api/v1/projects/{id}/sandboxes."
            : "Local seed. The server uses the control plane when CONTROL_PLANE_URL is set."
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
            {page && rows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No sandboxes yet.</p>
            ) : null}
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
