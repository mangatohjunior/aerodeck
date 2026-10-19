"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteProject, updateProject } from "@/lib/api";
import {
  normalizeProjectDescription,
  parseProjectUpdateFields,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
} from "@/lib/project-input";
import type { Project } from "@/lib/types";

type ProjectEditPanelProps = {
  project: Project;
  onUpdated: (project: Project) => void;
};

export function ProjectEditPanel({ project, onUpdated }: ProjectEditPanelProps) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = parseProjectUpdateFields({
      name,
      description: normalizeProjectDescription(description),
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProject(project.id, parsed.value);
      onUpdated(updated);
      setName(updated.name);
      setDescription(updated.description ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete project “${project.name}”? Environments are removed and deployment links are cleared.`,
    );
    if (!confirmed) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await deleteProject(project.id);
      router.push("/projects");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <Card className="mb-6">
      <CardHeader className="border-b">
        <CardTitle className="text-base">Edit project</CardTitle>
      </CardHeader>
      <form onSubmit={handleSave}>
        <CardContent className="grid gap-4 pt-6">
          <p className="font-mono text-sm text-primary">{project.slug}</p>
          <div className="grid gap-2">
            <Label htmlFor="edit-project-name">Name</Label>
            <Input
              id="edit-project-name"
              value={name}
              maxLength={PROJECT_NAME_MAX}
              disabled={busy}
              onChange={(event) => {
                setName(event.currentTarget.value);
                if (error) {
                  setError(null);
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-project-description">Description</Label>
            <Textarea
              id="edit-project-description"
              value={description}
              maxLength={PROJECT_DESCRIPTION_MAX}
              rows={3}
              disabled={busy}
              onChange={(event) => {
                setDescription(event.currentTarget.value);
                if (error) {
                  setError(null);
                }
              }}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 border-t">
          <Button type="submit" disabled={busy}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save project"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void handleDelete();
            }}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            {deleting ? "Deleting…" : "Delete project"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
