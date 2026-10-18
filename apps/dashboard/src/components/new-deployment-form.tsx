"use client";

import { Loader2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDeployment,
  ProvisionEnqueueFailed,
  shouldOpenDeploymentAfterCreate,
} from "@/lib/api";
import { parseGithubRepo } from "@/lib/github";
import { useDeployEnvironments } from "@/lib/use-deploy-environments";
import { cn } from "@/lib/utils";

export function NewDeploymentForm({ controlPlane = false }: { controlPlane?: boolean }) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const {
    environmentKey,
    setEnvironmentKey,
    environments,
    environmentsError,
    loadingEnvironments,
  } = useDeployEnvironments(controlPlane);
  const [error, setError] = useState<string | null>(null);
  const [repoInvalid, setRepoInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRepoInvalid(false);

    if (!parseGithubRepo(repoUrl)) {
      setRepoInvalid(true);
      setError("Enter a GitHub URL like https://github.com/org/repo");
      return;
    }

    let target: { projectId: string; environmentId: string } | undefined;
    if (controlPlane) {
      const selected = environments.find((row) => `${row.project_id}:${row.id}` === environmentKey);
      if (!selected) {
        setError("Select an environment to provision.");
        return;
      }
      target = { projectId: selected.project_id, environmentId: selected.id };
    }

    setSubmitting(true);
    try {
      const deployment = await createDeployment(repoUrl, controlPlane, target);
      if (shouldOpenDeploymentAfterCreate(deployment)) {
        router.push(`/deployments/${deployment.id}`);
      }
    } catch (cause) {
      if (cause instanceof ProvisionEnqueueFailed) {
        // Do not open the terminal: empty logs would stub Done and mark succeeded.
        setError(
          `${cause.message} Deployment ${cause.deploymentId} was stored, but provision was not queued.`,
        );
        return;
      }
      setError(cause instanceof Error ? cause.message : "Deploy failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    repoUrl.trim().length > 0 &&
    (!controlPlane || (environmentKey.length > 0 && !loadingEnvironments));

  return (
    <Card className="overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>Repository</CardTitle>
        <CardDescription>
          {controlPlane
            ? "HTTPS GitHub URL and an existing environment. The dashboard server stores the deployment and queues provision."
            : "HTTPS GitHub URL. Validated in the browser, then POSTed to /api/mock/v1/deployments."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="github-url">GitHub URL</Label>
            <Input
              id="github-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://github.com/mangatohjunior/aerodeck"
              value={repoUrl}
              aria-invalid={repoInvalid ? true : undefined}
              disabled={submitting}
              onValueChange={(value) => {
                setRepoUrl(value);
                if (repoInvalid) {
                  setRepoInvalid(false);
                }
                if (error) {
                  setError(null);
                }
              }}
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">Example: https://github.com/org/app.git</p>
          </div>
          {controlPlane ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="environment">Environment</Label>
              {/* Native select: dashboard UI kit has no Select yet; keep styles aligned with Input. */}
              <select
                id="environment"
                className={cn(
                  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                value={environmentKey}
                disabled={submitting || loadingEnvironments || environments.length === 0}
                onChange={(event) => {
                  setEnvironmentKey(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
              >
                <option value="">
                  {loadingEnvironments
                    ? "Loading environments…"
                    : environments.length === 0
                      ? "No environments available"
                      : "Select an environment"}
                </option>
                {environments.map((row) => (
                  <option key={`${row.project_id}:${row.id}`} value={`${row.project_id}:${row.id}`}>
                    {row.project_slug}/{row.slug} ({row.kind}, {row.region})
                  </option>
                ))}
              </select>
              {environmentsError ? (
                <p className="text-sm text-destructive" role="alert">
                  {environmentsError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Provision runs on the control-plane worker for the selected environment.
                </p>
              )}
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" size="lg" disabled={!canSubmit}>
            {submitting ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Rocket data-icon="inline-start" />
            )}
            {submitting ? "Deploying…" : "Deploy"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
