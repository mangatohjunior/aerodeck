"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteEnvironment, updateEnvironment } from "@/lib/api";
import {
  ENVIRONMENT_KINDS,
  ENVIRONMENT_REGIONS,
  parseEnvironmentUpdateFields,
  type EnvironmentKind,
  type EnvironmentRegion,
} from "@/lib/environment-input";
import { nativeSelectClassName } from "@/lib/native-select";
import { PROJECT_NAME_MAX } from "@/lib/project-input";
import type { EnvironmentOption } from "@/lib/types";

type EnvironmentEditRowProps = {
  environment: EnvironmentOption;
  onUpdated: (environment: EnvironmentOption) => void;
  onDeleted: (environmentId: string) => void;
};

export function EnvironmentEditRow({
  environment,
  onUpdated,
  onDeleted,
}: EnvironmentEditRowProps) {
  const [name, setName] = useState(environment.name);
  const [kind, setKind] = useState<EnvironmentKind>(
    (ENVIRONMENT_KINDS as readonly string[]).includes(environment.kind)
      ? (environment.kind as EnvironmentKind)
      : "dev",
  );
  const [region, setRegion] = useState<EnvironmentRegion>(
    (ENVIRONMENT_REGIONS as readonly string[]).includes(environment.region)
      ? (environment.region as EnvironmentRegion)
      : "nyc3",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = parseEnvironmentUpdateFields({ name, kind, region });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateEnvironment(
        environment.project_id,
        environment.id,
        parsed.value,
      );
      onUpdated(updated);
      setName(updated.name);
      setKind(
        (ENVIRONMENT_KINDS as readonly string[]).includes(updated.kind)
          ? (updated.kind as EnvironmentKind)
          : kind,
      );
      setRegion(
        (ENVIRONMENT_REGIONS as readonly string[]).includes(updated.region)
          ? (updated.region as EnvironmentRegion)
          : region,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete environment “${environment.slug}”? Linked deployments will be cleared.`,
    );
    if (!confirmed) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await deleteEnvironment(environment.project_id, environment.id);
      onDeleted(environment.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <form onSubmit={handleSave} className="grid gap-3 py-4 first:pt-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="font-mono text-xs text-primary">{environment.slug}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`env-name-${environment.id}`}>Name</Label>
        <Input
          id={`env-name-${environment.id}`}
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
        <Label htmlFor={`env-kind-${environment.id}`}>Kind</Label>
        <select
          id={`env-kind-${environment.id}`}
          className={nativeSelectClassName()}
          value={kind}
          disabled={busy}
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
        <Label htmlFor={`env-region-${environment.id}`}>Region</Label>
        <select
          id={`env-region-${environment.id}`}
          className={nativeSelectClassName()}
          value={region}
          disabled={busy}
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
      <div className="flex flex-wrap items-end gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
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
          Delete
        </Button>
      </div>
      {error ? (
        <p className="sm:col-span-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
