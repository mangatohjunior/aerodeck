"use client";

import { Box, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  SandboxImageField,
  SandboxProjectField,
  SandboxResourceFields,
} from "@/components/sandbox-form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSandbox } from "@/lib/api";
import {
  DEFAULT_SANDBOX_IMAGE,
  DEFAULT_SANDBOX_MEMORY_MIB,
  DEFAULT_SANDBOX_TTL_SECONDS,
  DEFAULT_SANDBOX_VCPU,
  parseSandboxCreateFields,
} from "@/lib/sandbox-input";
import type { Project, Sandbox } from "@/lib/types";

type NewSandboxFormProps = {
  projects: Project[];
  onCreated: (sandbox: Sandbox) => void;
};

export function NewSandboxForm({ projects, onCreated }: NewSandboxFormProps) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [image, setImage] = useState(DEFAULT_SANDBOX_IMAGE);
  const [vcpu, setVcpu] = useState(String(DEFAULT_SANDBOX_VCPU));
  const [memoryMib, setMemoryMib] = useState(String(DEFAULT_SANDBOX_MEMORY_MIB));
  const [ttlSeconds, setTtlSeconds] = useState(String(DEFAULT_SANDBOX_TTL_SECONDS));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedProjectId = projects.some((row) => row.id === projectId)
    ? projectId
    : (projects[0]?.id ?? "");

  function clearError() {
    if (error) {
      setError(null);
    }
  }

  function resetFields() {
    setImage(DEFAULT_SANDBOX_IMAGE);
    setVcpu(String(DEFAULT_SANDBOX_VCPU));
    setMemoryMib(String(DEFAULT_SANDBOX_MEMORY_MIB));
    setTtlSeconds(String(DEFAULT_SANDBOX_TTL_SECONDS));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = parseSandboxCreateFields({
      projectId: selectedProjectId,
      image,
      vcpu,
      memoryMib,
      ttlSeconds,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setSubmitting(true);
    try {
      const sandbox = await createSandbox(parsed.value);
      onCreated(sandbox);
      resetFields();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Boot sandbox failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    projects.length > 0 &&
    selectedProjectId.length > 0 &&
    image.trim().length > 0 &&
    vcpu.trim().length > 0 &&
    memoryMib.trim().length > 0 &&
    ttlSeconds.trim().length > 0;

  return (
    <Card className="mb-6 overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>New sandbox</CardTitle>
        <CardDescription>
          Boots a short-lived Firecracker microVM from a declared guest image under a project.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <SandboxProjectField
            projects={projects}
            projectId={selectedProjectId}
            disabled={submitting}
            onProjectIdChange={setProjectId}
            onClearError={clearError}
          />
          <SandboxImageField
            image={image}
            disabled={submitting}
            onImageChange={(value) => {
              setImage(value);
              clearError();
            }}
          />
          <SandboxResourceFields
            vcpu={vcpu}
            memoryMib={memoryMib}
            ttlSeconds={ttlSeconds}
            disabled={submitting}
            onChange={{
              vcpu: (value) => {
                setVcpu(value);
                clearError();
              },
              memoryMib: (value) => {
                setMemoryMib(value);
                clearError();
              },
              ttlSeconds: (value) => {
                setTtlSeconds(value);
                clearError();
              },
            }}
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
              <Box className="size-4" aria-hidden />
            )}
            {submitting ? "Booting…" : "Boot sandbox"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
