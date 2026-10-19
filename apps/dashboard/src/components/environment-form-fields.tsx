"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ENVIRONMENT_KINDS, ENVIRONMENT_REGIONS } from "@/lib/environment-input";
import { nativeSelectClassName } from "@/lib/native-select";
import { PROJECT_NAME_MAX, PROJECT_SLUG_MAX } from "@/lib/project-input";
import type { Project } from "@/lib/types";

type ClearError = () => void;

export function EnvironmentProjectField({
  projects,
  projectId,
  disabled,
  onProjectIdChange,
  onClearError,
}: {
  projects: Project[];
  projectId: string;
  disabled: boolean;
  onProjectIdChange: (projectId: string) => void;
  onClearError: ClearError;
}) {
  if (projects.length === 1) {
    const only = projects[0];
    return (
      <p className="sm:col-span-2 text-sm text-muted-foreground">
        Project{" "}
        <span className="font-medium text-foreground">
          {only.name} ({only.slug})
        </span>
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:col-span-2">
      <Label htmlFor="environment-project">Project</Label>
      <select
        id="environment-project"
        className={nativeSelectClassName()}
        value={projectId}
        disabled={disabled || projects.length === 0}
        onChange={(event) => {
          onProjectIdChange(event.target.value);
          onClearError();
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
  );
}

export function EnvironmentNameSlugFields({
  name,
  slug,
  disabled,
  onNameChange,
  onSlugChange,
}: {
  name: string;
  slug: string;
  disabled: boolean;
  onNameChange: (name: string) => void;
  onSlugChange: (slug: string) => void;
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="environment-name">Name</Label>
        <Input
          id="environment-name"
          name="name"
          value={name}
          maxLength={PROJECT_NAME_MAX}
          autoComplete="off"
          placeholder="Production"
          disabled={disabled}
          onChange={(event) => onNameChange(event.currentTarget.value)}
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
          disabled={disabled}
          onChange={(event) => onSlugChange(event.currentTarget.value.trim().toLowerCase())}
        />
      </div>
    </>
  );
}

/** Curated options plus a live wire value when CP has a valid but non-listed slug. */
export function withCurrentOption(options: readonly string[], current: string): string[] {
  if (options.includes(current)) {
    return [...options];
  }
  return [current, ...options];
}

export function EnvironmentKindField({
  kind,
  disabled,
  onKindChange,
  onClearError,
  idPrefix = "environment",
  options = ENVIRONMENT_KINDS,
}: {
  kind: string;
  disabled: boolean;
  onKindChange: (kind: string) => void;
  onClearError: ClearError;
  idPrefix?: string;
  options?: readonly string[];
}) {
  const id = `${idPrefix}-kind`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Kind</Label>
      <select
        id={id}
        className={nativeSelectClassName()}
        value={kind}
        disabled={disabled}
        onChange={(event) => {
          onKindChange(event.target.value);
          onClearError();
        }}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EnvironmentRegionField({
  region,
  disabled,
  onRegionChange,
  onClearError,
  idPrefix = "environment",
  options = ENVIRONMENT_REGIONS,
}: {
  region: string;
  disabled: boolean;
  onRegionChange: (region: string) => void;
  onClearError: ClearError;
  idPrefix?: string;
  options?: readonly string[];
}) {
  const id = `${idPrefix}-region`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Region</Label>
      <select
        id={id}
        className={nativeSelectClassName()}
        value={region}
        disabled={disabled}
        onChange={(event) => {
          onRegionChange(event.target.value);
          onClearError();
        }}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );
}