"use client";

import { Layers, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

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
import { createEnvironment } from "@/lib/api";
import {
  DEFAULT_ENVIRONMENT_REGION,
  ENVIRONMENT_KINDS,
  ENVIRONMENT_REGIONS,
  parseEnvironmentCreateFields,
  type EnvironmentKind,
  type EnvironmentRegion,
} from "@/lib/environment-input";
import { nativeSelectClassName } from "@/lib/native-select";
import { PROJECT_NAME_MAX, PROJECT_SLUG_MAX, slugFromName } from "@/lib/project-input";
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

  function bindName(value: string) {
    setName(value);
    if (error) {
      setError(null);
    }
    if (!slugTouched) {
      setSlug(slugFromName(value));
    }
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
      setName("");
      setSlug("");
      setSlugTouched(false);
      setKind("dev");
      setRegion(DEFAULT_ENVIRONMENT_REGION);
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
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="environment-project">Project</Label>
            <select
              id="environment-project"
              className={nativeSelectClassName()}
              value={projectId}
              disabled={submitting || projects.length === 0}
              onChange={(event) => {
                setProjectId(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
            >
              {projects.length === 0 ? (
                <option value="">Create a project first</option>
              ) : (
                projects.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.slug})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="environment-name">Name</Label>
            <Input
              id="environment-name"
              name="name"
              value={name}
              maxLength={PROJECT_NAME_MAX}
              autoComplete="off"
              placeholder="Production"
              disabled={submitting}
              onChange={(event) => bindName(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="environment-slug">Slug</Label>
            <Input
              id="environment-slug"
              name="slug"
              value={slug}
              maxLength={PROJECT_SLUG_MAX}
              autoComplete="off"
              spellCheck={false}
              placeholder="prod"
              className="font-mono text-sm"
              disabled={submitting}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.currentTarget.value.trim().toLowerCase());
                if (error) {
                  setError(null);
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="environment-kind">Kind</Label>
            <select
              id="environment-kind"
              className={nativeSelectClassName()}
              value={kind}
              disabled={submitting}
              onChange={(event) => {
                setKind(event.target.value as EnvironmentKind);
                if (error) {
                  setError(null);
                }
              }}
            >
              {ENVIRONMENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="environment-region">Region</Label>
            <select
              id="environment-region"
              className={nativeSelectClassName()}
              value={region}
              disabled={submitting}
              onChange={(event) => {
                setRegion(event.target.value as EnvironmentRegion);
                if (error) {
                  setError(null);
                }
              }}
            >
              {ENVIRONMENT_REGIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
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
