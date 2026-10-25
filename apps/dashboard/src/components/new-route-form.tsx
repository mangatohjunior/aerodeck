"use client";

import { Globe, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  RouteBackendFields,
  RouteEnvironmentField,
  RouteHostnameField,
} from "@/components/route-form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createProjectRoute } from "@/lib/api";
import {
  DEFAULT_ROUTE_BACKEND_HOST,
  DEFAULT_ROUTE_BACKEND_PORT,
  DEFAULT_ROUTE_PATH_PREFIX,
  parseRouteCreateFields,
} from "@/lib/route-input";
import type { EnvironmentOption, ProjectRoute } from "@/lib/types";

type NewRouteFormProps = {
  projectId: string;
  environments: EnvironmentOption[];
  onCreated: (route: ProjectRoute) => void;
};

export function NewRouteForm({ projectId, environments, onCreated }: NewRouteFormProps) {
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");
  const [hostname, setHostname] = useState("");
  const [backendHost, setBackendHost] = useState(DEFAULT_ROUTE_BACKEND_HOST);
  const [backendPort, setBackendPort] = useState(String(DEFAULT_ROUTE_BACKEND_PORT));
  const [pathPrefix, setPathPrefix] = useState(DEFAULT_ROUTE_PATH_PREFIX);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedEnvironmentId = environments.some((row) => row.id === environmentId)
    ? environmentId
    : (environments[0]?.id ?? "");

  function clearError() {
    if (error) {
      setError(null);
    }
  }

  function resetFields() {
    setHostname("");
    setBackendHost(DEFAULT_ROUTE_BACKEND_HOST);
    setBackendPort(String(DEFAULT_ROUTE_BACKEND_PORT));
    setPathPrefix(DEFAULT_ROUTE_PATH_PREFIX);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = parseRouteCreateFields({
      projectId,
      environmentId: selectedEnvironmentId,
      hostname,
      backendHost,
      backendPort,
      pathPrefix,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setSubmitting(true);
    try {
      const route = await createProjectRoute(parsed.value);
      onCreated(route);
      resetFields();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Create route failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    environments.length > 0 &&
    selectedEnvironmentId.length > 0 &&
    hostname.trim().length > 0 &&
    backendHost.trim().length > 0 &&
    backendPort.trim().length > 0;

  return (
    <Card className="mb-4 overflow-hidden ring-primary/15">
      <div className="h-1 bg-gradient-to-r from-primary via-runway to-primary/40" />
      <CardHeader className="border-b">
        <CardTitle>New route</CardTitle>
        <CardDescription>
          Declares a Traefik hostname on the control plane and publishes its public DNS record.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <RouteEnvironmentField
            environments={environments}
            environmentId={selectedEnvironmentId}
            disabled={submitting}
            onEnvironmentIdChange={setEnvironmentId}
            onClearError={clearError}
          />
          <RouteHostnameField
            hostname={hostname}
            disabled={submitting}
            onHostnameChange={(value) => {
              setHostname(value);
              clearError();
            }}
          />
          <RouteBackendFields
            backendHost={backendHost}
            backendPort={backendPort}
            pathPrefix={pathPrefix}
            disabled={submitting}
            onChange={{
              backendHost: (value) => {
                setBackendHost(value);
                clearError();
              },
              backendPort: (value) => {
                setBackendPort(value);
                clearError();
              },
              pathPrefix: (value) => {
                setPathPrefix(value);
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
              <Globe className="size-4" aria-hidden />
            )}
            {submitting ? "Creating…" : "Create route"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
