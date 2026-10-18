"use client";

import { Activity, Box, FolderGit2, Rocket } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchDeployments, fetchProjectPage, fetchSandboxPage } from "@/lib/api";
import type { Deployment, ProjectPage, SandboxPage } from "@/lib/types";

export function OverviewConsole({ controlPlane = false }: { controlPlane?: boolean }) {
  const [projects, setProjects] = useState<ProjectPage | null>(null);
  const [sandboxes, setSandboxes] = useState<SandboxPage | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchProjectPage(), fetchSandboxPage(), fetchDeployments(controlPlane)])
      .then(([nextProjects, nextSandboxes, nextDeployments]) => {
        setProjects(nextProjects);
        setSandboxes(nextSandboxes);
        setDeployments(nextDeployments);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load the console.");
      });
  }, [controlPlane]);

  const sandboxRows = sandboxes?.items ?? [];
  const runningSandboxes = sandboxRows.filter((row) => row.status === "running").length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Overview"
        title="AeroDeck console"
        description={
          controlPlane
            ? "Projects, sandboxes, and deployments are read by this server from the control plane."
            : "Projects and sandboxes are read by this server from the control plane. Deployments on this page stay local."
        }
        actions={
          <LinkButton href="/deploy">
            <Rocket data-icon="inline-start" />
            New deployment
          </LinkButton>
        }
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={FolderGit2}
              label="Projects"
              value={projects?.total ?? 0}
              hint={projects?.source === "control-plane" ? "Live control plane" : "Local seed"}
            />
            <StatCard
              icon={Box}
              label="Sandboxes"
              value={runningSandboxes}
              hint={
                sandboxes?.source === "control-plane"
                  ? `${sandboxRows.length} total · Live control plane`
                  : `${sandboxRows.length} total · Local seed`
              }
            />
            <StatCard
              icon={Activity}
              label="Deployments"
              value={deployments.length}
              hint={controlPlane ? "Stored by the control plane" : "Created this session"}
            />
          </div>

          <Card className="mt-6">
            <CardHeader className="border-b">
              <CardTitle>Recent deployments</CardTitle>
              <CardDescription>
                {controlPlane
                  ? "Rows stored by the control plane."
                  : "Empty until you POST a GitHub URL from Deploy."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deployments yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {deployments.slice(0, 5).map((row) => (
                    <li key={row.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/deployments/${row.id}`}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          {row.owner}/{row.repo}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{row.id}</p>
                      </div>
                      <Badge variant="secondary">{row.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FolderGit2;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          {label}
        </CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
