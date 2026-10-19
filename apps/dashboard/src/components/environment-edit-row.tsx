"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  EnvironmentKindField,
  EnvironmentRegionField,
  withCurrentOption,
} from "@/components/environment-form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteEnvironment, updateEnvironment } from "@/lib/api";
import {
  ENVIRONMENT_KINDS,
  ENVIRONMENT_REGIONS,
  parseEnvironmentUpdateFields,
} from "@/lib/environment-input";
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
  const [kind, setKind] = useState(environment.kind);
  const [region, setRegion] = useState(environment.region);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const idPrefix = `env-${environment.id}`;

  function clearError() {
    if (error) {
      setError(null);
    }
  }

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
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={PROJECT_NAME_MAX}
          disabled={busy}
          onChange={(event) => {
            setName(event.currentTarget.value);
            clearError();
          }}
        />
      </div>
      <EnvironmentKindField
        idPrefix={idPrefix}
        kind={kind}
        options={withCurrentOption(ENVIRONMENT_KINDS, environment.kind)}
        disabled={busy}
        onKindChange={setKind}
        onClearError={clearError}
      />
      <EnvironmentRegionField
        idPrefix={idPrefix}
        region={region}
        options={withCurrentOption(ENVIRONMENT_REGIONS, environment.region)}
        disabled={busy}
        onRegionChange={setRegion}
        onClearError={clearError}
      />
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
