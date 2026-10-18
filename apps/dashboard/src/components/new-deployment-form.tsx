"use client";

import { Loader2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { EnvironmentSelect } from "@/components/environment-select";
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
import { createDeployment, ProvisionEnqueueFailed } from "@/lib/api";
import { environmentOptionKey } from "@/lib/environment-option";
import { parseGithubRepo } from "@/lib/github";
import { useDeployEnvironments } from "@/lib/use-deploy-environments";

export function NewDeploymentForm({ controlPlane = false }: { controlPlane?: boolean }) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const {
    environmentKey,
    setEnvironmentKey,
    environments,
    environmentsError,
    loadingEnvironments,
    reload,
  } = useDeployEnvironments(controlPlane);
  const [error, setError] = useState<string | null>(null);
  const [repoInvalid, setRepoInvalid] = useState(false);
  const [environmentRequired, setEnvironmentRequired] = useState(false);
  const [enqueueBlocked, setEnqueueBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enqueueBlocked) {
      return;
    }
    setError(null);
    setRepoInvalid(false);
    setEnvironmentRequired(false);

    if (!parseGithubRepo(repoUrl)) {
      setRepoInvalid(true);
      setError("Enter a GitHub URL like https://github.com/org/repo");
      return;
    }

    let target: { projectId: string; environmentId: string } | undefined;
    if (controlPlane) {
      const selected = environments.find(
        (row) => environmentOptionKey(row) === environmentKey,
      );
      if (!selected) {
        setEnvironmentRequired(true);
        setError("Select an environment to provision.");
        return;
      }
      target = { projectId: selected.project_id, environmentId: selected.id };
    }

    setSubmitting(true);
    try {
      const deployment =
        controlPlane && target
          ? await createDeployment(repoUrl, true, target)
          : await createDeployment(repoUrl, false);
      router.push(`/deployments/${deployment.id}`);
    } catch (cause) {
      if (cause instanceof ProvisionEnqueueFailed) {
        // Do not open the terminal or create another row; orphan cleanup is #127.
        setEnqueueBlocked(true);
        setError(
          `${cause.message} Do not Deploy again until that running row is cleaned up.`,
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
    !enqueueBlocked &&
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
              disabled={submitting || enqueueBlocked}
              onValueChange={(value) => {
                setRepoUrl(value);
                if (repoInvalid) {
                  setRepoInvalid(false);
                }
                if (error && !enqueueBlocked) {
                  setError(null);
                }
              }}
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">Example: https://github.com/org/app.git</p>
          </div>
          {controlPlane ? (
            <EnvironmentSelect
              environments={environments}
              environmentKey={environmentKey}
              onEnvironmentKeyChange={(key) => {
                setEnvironmentKey(key);
                if (environmentRequired) {
                  setEnvironmentRequired(false);
                }
                if (error && !enqueueBlocked) {
                  setError(null);
                }
              }}
              environmentsError={environmentsError}
              loadingEnvironments={loadingEnvironments}
              invalid={!!environmentsError || environmentRequired}
              disabled={submitting || enqueueBlocked}
              onRetry={reload}
            />
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
