"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/native-select";
import {
  DEFAULT_ROUTE_BACKEND_HOST,
  ROUTE_BACKEND_HOST_MAX,
  ROUTE_HOSTNAME_MAX,
  ROUTE_PATH_PREFIX_MAX,
} from "@/lib/route-input";
import type { EnvironmentOption } from "@/lib/types";

type ClearError = () => void;

export function RouteEnvironmentField({
  environments,
  environmentId,
  disabled,
  onEnvironmentIdChange,
  onClearError,
}: {
  environments: EnvironmentOption[];
  environmentId: string;
  disabled: boolean;
  onEnvironmentIdChange: (environmentId: string) => void;
  onClearError: ClearError;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="route-environment">Environment</Label>
      <select
        id="route-environment"
        className={nativeSelectClassName()}
        value={environmentId}
        disabled={disabled || environments.length === 0}
        onChange={(event) => {
          onEnvironmentIdChange(event.target.value);
          onClearError();
        }}
      >
        {environments.length === 0 ? (
          <option value="">Create an environment first</option>
        ) : (
          environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name} ({env.slug})
            </option>
          ))
        )}
      </select>
    </div>
  );
}

export function RouteHostnameField({
  hostname,
  disabled,
  onHostnameChange,
}: {
  hostname: string;
  disabled: boolean;
  onHostnameChange: (hostname: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="route-hostname">Hostname</Label>
      <Input
        id="route-hostname"
        name="hostname"
        value={hostname}
        maxLength={ROUTE_HOSTNAME_MAX}
        autoComplete="off"
        spellCheck={false}
        placeholder="payments.aero-deck.app"
        className="font-mono text-sm"
        disabled={disabled}
        onChange={(event) => onHostnameChange(event.currentTarget.value.trim().toLowerCase())}
      />
    </div>
  );
}

export function RouteBackendFields({
  backendHost,
  backendPort,
  pathPrefix,
  disabled,
  onChange,
}: {
  backendHost: string;
  backendPort: string;
  pathPrefix: string;
  disabled: boolean;
  onChange: {
    backendHost: (value: string) => void;
    backendPort: (value: string) => void;
    pathPrefix: (value: string) => void;
  };
}) {
  return (
    <>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="route-backend-host">Backend host (VPC IP or service)</Label>
          <span className="text-xs text-muted-foreground font-mono">
            Default: {DEFAULT_ROUTE_BACKEND_HOST}
          </span>
        </div>
        <Input
          id="route-backend-host"
          name="backend_host"
          value={backendHost}
          maxLength={ROUTE_BACKEND_HOST_MAX}
          autoComplete="off"
          spellCheck={false}
          placeholder={DEFAULT_ROUTE_BACKEND_HOST}
          className="font-mono text-sm"
          disabled={disabled}
          onChange={(event) => onChange.backendHost(event.currentTarget.value)}
        />
        <p className="text-xs text-muted-foreground">
          Control Droplet VPC IP ({DEFAULT_ROUTE_BACKEND_HOST}) is used by default.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="route-backend-port">Backend port</Label>
          <Input
            id="route-backend-port"
            name="backend_port"
            inputMode="numeric"
            value={backendPort}
            maxLength={5}
            autoComplete="off"
            placeholder="8080"
            className="font-mono text-sm"
            disabled={disabled}
            onChange={(event) => onChange.backendPort(event.currentTarget.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="route-path-prefix">Path prefix</Label>
          <Input
            id="route-path-prefix"
            name="path_prefix"
            value={pathPrefix}
            maxLength={ROUTE_PATH_PREFIX_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder="/"
            className="font-mono text-sm"
            disabled={disabled}
            onChange={(event) => onChange.pathPrefix(event.currentTarget.value)}
          />
        </div>
      </div>
    </>
  );
}

