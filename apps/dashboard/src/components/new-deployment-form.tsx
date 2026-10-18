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
import { createDeployment } from "@/lib/api";
import { parseGithubRepo } from "@/lib/github";

export function NewDeploymentForm({ controlPlane = false }: { controlPlane?: boolean }) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!parseGithubRepo(repoUrl)) {
      setError("Enter a GitHub URL like https://github.com/org/repo");
      return;
    }

    setSubmitting(true);
    try {
      const deployment = await createDeployment(repoUrl, controlPlane);
      router.push(`/deployments/${deployment.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deploy failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>Repository</CardTitle>
        <CardDescription>
          {controlPlane
            ? "HTTPS GitHub URL. The dashboard server stores the deployment in the control plane."
            : "HTTPS GitHub URL. Validated in the browser, then POSTed to /api/mock/v1/deployments."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="github-url">GitHub URL</Label>
            <Input
              id="github-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://github.com/mangatohjunior/aerodeck"
              value={repoUrl}
              aria-invalid={error ? true : undefined}
              disabled={submitting}
              onValueChange={(value) => {
                setRepoUrl(value);
                if (error) {
                  setError(null);
                }
              }}
              className="h-10"
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Example: https://github.com/org/app.git
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={submitting || repoUrl.trim().length === 0}
          >
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
