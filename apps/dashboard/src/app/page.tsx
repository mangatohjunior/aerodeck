"use client";

import { Activity, Box, FolderGit2, Rocket } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchDeployments, fetchProjects, fetchSandboxes } from "@/lib/api";
import type { Deployment, Project, Sandbox } from "@/lib/types";

export default function OverviewPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchSandboxes(), fetchDeployments()])
      .then(([nextProjects, nextSandboxes, nextDeployments]) => {
        setProjects(nextProjects);
        setSandboxes(nextSandboxes);
        setDeployments(nextDeployments);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load mock API.");
      });
  }, []);

  const runningSandboxes = sandboxes.filter((row) => row.status === "running").length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Overview"
        title="AeroDeck console"
        description="Local mock control plane. Cards and tables are served from /api/mock/v1 — FastAPI is not required."
        actions={
          <Button render={<Link href="/deploy" />}>
            <Rocket data-icon="inline-start" />
            New deployment
          </Button>
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
              value={projects.length}
              hint="Seeded mock tenants"
            />
            <StatCard
              icon={Box}
              label="Sandboxes"
              value={runningSandboxes}
              hint={`${sandboxes.length} total · Firecracker`}
            />
            <StatCard
              icon={Activity}
              label="Deployments"
              value={deployments.length}
              hint="Created this session"
            />
          </div>

          <Card className="mt-6">
            <CardHeader className="border-b">
              <CardTitle>Recent deployments</CardTitle>
              <CardDescription>
                Empty until you POST a GitHub URL from Deploy.
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
