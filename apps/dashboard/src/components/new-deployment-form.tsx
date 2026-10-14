"use client";

import { Loader2, Rocket } from "lucide-react";
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
  mockCreateDeployment,
  parseGithubRepo,
  type Deployment,
} from "@/lib/mock-deploy";

type NewDeploymentFormProps = {
  onDeployed: (deployment: Deployment) => void;
};

export function NewDeploymentForm({ onDeployed }: NewDeploymentFormProps) {
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
      const deployment = await mockCreateDeployment(repoUrl);
      onDeployed(deployment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deploy failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6">
        <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
          Deploy
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          New Deployment
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Point AeroDeck at a GitHub repository. This UI mocks the control-plane
          POST and streams fake logs — no FastAPI calls yet.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Repository</CardTitle>
          <CardDescription>
            HTTPS GitHub URL. Validated locally, then a mock create-deployment
            request runs in the browser.
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
    </div>
  );
}
