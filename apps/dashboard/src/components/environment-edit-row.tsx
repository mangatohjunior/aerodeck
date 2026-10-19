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
} from "@/lib/environment-input";
import { nativeSelectClassName } from "@/lib/native-select";
import { PROJECT_NAME_MAX } from "@/lib/project-input";
import type { EnvironmentOption } from "@/lib/types";

type EnvironmentEditRowProps = {
  environment: EnvironmentOption;
  onUpdated: (environment: EnvironmentOption) => void;
  onDeleted: (environmentId: string) => void;
};

/** Curated options plus the live wire value when CP has a valid but non-listed slug. */
function withCurrentOption(options: readonly string[], current: string): string[] {
  if (options.includes(current)) {
    return [...options];
  }
  return [current, ...options];
}

export function EnvironmentEditRow({
  environment,
  onUpdated,
  onDeleted,
}: EnvironmentEditRowProps) {
  const [name, setName] = useState(environment.name);
  const [kind, setKind] = useState(environment.kind);
  const [region, setRegion] = useState(environment.region);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const kindOptions = withCurrentOption(ENVIRONMENT_KINDS, environment.kind);
  const regionOptions = withCurrentOption(ENVIRONMENT_REGIONS, environment.region);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fields: { name?: string; kind?: string; region?: string } = {};
    if (name.trim() !== environment.name) {
      fields.name = name;
    }
    if (kind !== environment.kind) {
      fields.kind = kind;
    }
    if (region !== environment.region) {
      fields.region = region;
    }
    const parsed = parseEnvironmentUpdateFields(fields);
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
      setKind(updated.kind);
      setRegion(updated.region);
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
            setKind(event.target.value);
            if (error) {
              setError(null);
            }
          }}
        >
          {kindOptions.map((value) => (
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
            setRegion(event.target.value);
            if (error) {
              setError(null);
            }
          }}
        >
          {regionOptions.map((value) => (
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
