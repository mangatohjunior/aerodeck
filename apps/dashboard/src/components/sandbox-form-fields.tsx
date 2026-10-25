"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/native-select";
import { SANDBOX_IMAGE_MAX } from "@/lib/sandbox-input";
import type { Project } from "@/lib/types";

type ClearError = () => void;

export function SandboxProjectField({
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
  return (
    <div className="grid gap-2">
      <Label htmlFor="sandbox-project">Project</Label>
      <select
        id="sandbox-project"
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
          projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.slug})
            </option>
          ))
        )}
      </select>
    </div>
  );
}

export function SandboxImageField({
  image,
  disabled,
  onImageChange,
}: {
  image: string;
  disabled: boolean;
  onImageChange: (image: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="sandbox-image">Guest image</Label>
      <Input
        id="sandbox-image"
        name="image"
        value={image}
        maxLength={SANDBOX_IMAGE_MAX}
        autoComplete="off"
        spellCheck={false}
        placeholder="alpine-3.20"
        className="font-mono text-sm"
        disabled={disabled}
        onChange={(event) => onImageChange(event.currentTarget.value.trim().toLowerCase())}
      />
    </div>
  );
}

export function SandboxResourceFields({
  vcpu,
  memoryMib,
  ttlSeconds,
  disabled,
  onChange,
}: {
  vcpu: string;
  memoryMib: string;
  ttlSeconds: string;
  disabled: boolean;
  onChange: {
    vcpu: (value: string) => void;
    memoryMib: (value: string) => void;
    ttlSeconds: (value: string) => void;
  };
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:col-span-2">
      <div className="grid gap-2">
        <Label htmlFor="sandbox-vcpu">vCPU (1–8)</Label>
        <Input
          id="sandbox-vcpu"
          name="vcpu"
          inputMode="numeric"
          value={vcpu}
          maxLength={2}
          autoComplete="off"
          placeholder="1"
          className="font-mono text-sm"
          disabled={disabled}
          onChange={(event) => onChange.vcpu(event.currentTarget.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sandbox-memory">Memory MiB (32–4096)</Label>
        <Input
          id="sandbox-memory"
          name="memory_mib"
          inputMode="numeric"
          value={memoryMib}
          maxLength={4}
          autoComplete="off"
          placeholder="128"
          className="font-mono text-sm"
          disabled={disabled}
          onChange={(event) => onChange.memoryMib(event.currentTarget.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sandbox-ttl">TTL seconds (30–86400)</Label>
        <Input
          id="sandbox-ttl"
          name="ttl_seconds"
          inputMode="numeric"
          value={ttlSeconds}
          maxLength={5}
          autoComplete="off"
          placeholder="3600"
          className="font-mono text-sm"
          disabled={disabled}
          onChange={(event) => onChange.ttlSeconds(event.currentTarget.value)}
        />
      </div>
    </div>
  );
}
