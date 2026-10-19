"use client";

import { FolderPlus, Loader2 } from "lucide-react";
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
import { createProject } from "@/lib/api";
import {
  isValidProjectName,
  isValidProjectSlug,
  normalizeProjectDescription,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  PROJECT_SLUG_MAX,
} from "@/lib/project-input";
import type { Project } from "@/lib/types";

type NewProjectFormProps = {
  onCreated: (project: Project) => void;
};

export function NewProjectForm({ onCreated }: NewProjectFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function bindName(value: string) {
    setName(value);
    if (error) {
      setError(null);
    }
    if (!slugTouched) {
      setSlug(slugFromName(value));
    }
  }

  function bindSlug(value: string) {
    setSlugTouched(true);
    setSlug(value.trim().toLowerCase());
    if (error) {
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    if (!isValidProjectName(trimmedName)) {
      setError("Enter a project name (1–120 characters).");
      return;
    }
    if (!isValidProjectSlug(trimmedSlug)) {
      setError(
        "Use a lowercase slug with letters, digits, and hyphens (no leading or trailing hyphen).",
      );
      return;
    }
    const normalizedDescription = normalizeProjectDescription(description);
    if (
      normalizedDescription !== null &&
      normalizedDescription.length > PROJECT_DESCRIPTION_MAX
    ) {
      setError("Description is too long.");
      return;
    }

    setSubmitting(true);
    try {
      const project = await createProject({
        name: trimmedName,
        slug: trimmedSlug,
        description: normalizedDescription,
      });
      onCreated(project);
      setName("");
      setSlug("");
      setDescription("");
      setSlugTouched(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Create project failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting && name.trim().length > 0 && slug.trim().length > 0;

  return (
    <Card className="mb-6 overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>New project</CardTitle>
        <CardDescription>
          Creates a tenant on the control plane. Deploy still needs an environment under
          this project.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-1">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              name="name"
              value={name}
              maxLength={PROJECT_NAME_MAX}
              autoComplete="off"
              placeholder="Payments"
              disabled={submitting}
              onChange={(event) => bindName(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-1">
            <Label htmlFor="project-slug">Slug</Label>
            <Input
              id="project-slug"
              name="slug"
              value={slug}
              maxLength={PROJECT_SLUG_MAX}
              autoComplete="off"
              spellCheck={false}
              placeholder="payments"
              className="font-mono text-sm"
              disabled={submitting}
              onChange={(event) => bindSlug(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Input
              id="project-description"
              name="description"
              value={description}
              maxLength={PROJECT_DESCRIPTION_MAX}
              autoComplete="off"
              placeholder="Tenant for card processing"
              disabled={submitting}
              onChange={(event) => {
                setDescription(event.currentTarget.value);
                if (error) {
                  setError(null);
                }
              }}
            />
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
              <FolderPlus className="size-4" aria-hidden />
            )}
            {submitting ? "Creating…" : "Create project"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/** Lowercase slug suggestion from a display name; empty when nothing usable remains. */
function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROJECT_SLUG_MAX);
}
