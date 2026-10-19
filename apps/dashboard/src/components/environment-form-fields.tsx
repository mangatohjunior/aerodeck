"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ENVIRONMENT_KINDS,
  ENVIRONMENT_REGIONS,
  type EnvironmentKind,
  type EnvironmentRegion,
} from "@/lib/environment-input";
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

/** Curated select options plus the live CP value when it is not already in the list. */
export function withCurrentOption(options: readonly string[], current: string): string[] {
  if (options.includes(current)) {
    return [...options];
  }
  return [current, ...options];
}

type SelectFieldProps<T extends string> = {
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
  onClearError: ClearError;
  idPrefix?: string;
  options: readonly T[];
  label: string;
  field: string;
};

function EnvironmentSelectField<T extends string>({
  value,
  disabled,
  onChange,
  onClearError,
  idPrefix = "environment",
  options,
  label,
  field,
}: SelectFieldProps<T>) {
  const id = `${idPrefix}-${field}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={nativeSelectClassName()}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value as T);
          onClearError();
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EnvironmentKindField<T extends string = EnvironmentKind>({
  kind,
  disabled,
  onKindChange,
  onClearError,
  idPrefix = "environment",
  options,
}: {
  kind: T;
  disabled: boolean;
  onKindChange: (kind: T) => void;
  onClearError: ClearError;
  idPrefix?: string;
  options?: readonly T[];
}) {
  return (
    <EnvironmentSelectField
      value={kind}
      disabled={disabled}
      onChange={onKindChange}
      onClearError={onClearError}
      idPrefix={idPrefix}
      options={options ?? (ENVIRONMENT_KINDS as unknown as readonly T[])}
      label="Kind"
      field="kind"
    />
  );
}

export function EnvironmentRegionField<T extends string = EnvironmentRegion>({
  region,
  disabled,
  onRegionChange,
  onClearError,
  idPrefix = "environment",
  options,
}: {
  region: T;
  disabled: boolean;
  onRegionChange: (region: T) => void;
  onClearError: ClearError;
  idPrefix?: string;
  options?: readonly T[];
}) {
  return (
    <EnvironmentSelectField
      value={region}
      disabled={disabled}
      onChange={onRegionChange}
      onClearError={onClearError}
      idPrefix={idPrefix}
      options={options ?? (ENVIRONMENT_REGIONS as unknown as readonly T[])}
      label="Region"
      field="region"
    />
  );
}
