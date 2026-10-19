"use client";

import { Layers, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import {
  EnvironmentKindField,
  EnvironmentNameSlugFields,
  EnvironmentProjectField,
  EnvironmentRegionField,
} from "@/components/environment-form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createEnvironment } from "@/lib/api";
import {
  DEFAULT_ENVIRONMENT_REGION,
  parseEnvironmentCreateFields,
  type EnvironmentKind,
  type EnvironmentRegion,
} from "@/lib/environment-input";
import { slugFromName } from "@/lib/project-input";
import type { EnvironmentOption, Project } from "@/lib/types";

type NewEnvironmentFormProps = {
  projects: Project[];
  onCreated: (environment: EnvironmentOption) => void;
};

export function NewEnvironmentForm({ projects, onCreated }: NewEnvironmentFormProps) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<EnvironmentKind>("dev");
  const [region, setRegion] = useState<EnvironmentRegion>(DEFAULT_ENVIRONMENT_REGION);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (projects.length === 0) {
      setProjectId("");
      return;
    }
    setProjectId((current) =>
      projects.some((row) => row.id === current) ? current : projects[0].id,
    );
  }, [projects]);

  function clearError() {
    if (error) {
      setError(null);
    }
  }

  function bindName(value: string) {
    setName(value);
    clearError();
    if (!slugTouched) {
      setSlug(slugFromName(value));
    }
  }

  function bindSlug(value: string) {
    setSlugTouched(true);
    setSlug(value);
    clearError();
  }

  function resetFields() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setKind("dev");
    setRegion(DEFAULT_ENVIRONMENT_REGION);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = parseEnvironmentCreateFields({
      projectId,
      name,
      slug,
      kind,
      region,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setSubmitting(true);
    try {
      const environment = await createEnvironment(parsed.value);
      onCreated(environment);
      resetFields();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Create environment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    projectId.length > 0 &&
    name.trim().length > 0 &&
    slug.trim().length > 0 &&
    projects.length > 0;

  return (
    <Card className="mb-6 overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>New environment</CardTitle>
        <CardDescription>
          Creates a DigitalOcean-backed environment under a project. Deploy can provision it
          after this succeeds.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <EnvironmentProjectField
            projects={projects}
            projectId={projectId}
            disabled={submitting}
            onProjectIdChange={setProjectId}
            onClearError={clearError}
          />
          <EnvironmentNameSlugFields
            name={name}
            slug={slug}
            disabled={submitting}
            onNameChange={bindName}
            onSlugChange={bindSlug}
          />
          <EnvironmentKindField
            kind={kind}
            disabled={submitting}
            onKindChange={setKind}
            onClearError={clearError}
          />
          <EnvironmentRegionField
            region={region}
            disabled={submitting}
            onRegionChange={setRegion}
            onClearError={clearError}
          />
          {error ? (
            <p className="sm:col-span-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="border-t">
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Layers className="size-4" aria-hidden />
            )}
            {submitting ? "Creating…" : "Create environment"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
