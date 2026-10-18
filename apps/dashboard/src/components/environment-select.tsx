"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { environmentOptionKey } from "@/lib/environment-option";
import type { EnvironmentOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type EnvironmentSelectProps = {
  environments: EnvironmentOption[];
  environmentKey: string;
  onEnvironmentKeyChange: (key: string) => void;
  environmentsError: string | null;
  loadingEnvironments: boolean;
  invalid: boolean;
  disabled: boolean;
  onRetry: () => void;
};

/** Native select until the dashboard UI kit gains a shadcn Select. */
export function EnvironmentSelect({
  environments,
  environmentKey,
  onEnvironmentKeyChange,
  environmentsError,
  loadingEnvironments,
  invalid,
  disabled,
  onRetry,
}: EnvironmentSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="environment">Environment</Label>
      <select
        id="environment"
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        )}
        value={environmentKey}
        aria-invalid={invalid ? true : undefined}
        disabled={disabled || loadingEnvironments || environments.length === 0}
        onChange={(event) => onEnvironmentKeyChange(event.target.value)}
      >
        <option value="">
          {loadingEnvironments
            ? "Loading environments…"
            : environments.length === 0
              ? "No environments available"
              : "Select an environment"}
        </option>
        {environments.map((row) => {
          const key = environmentOptionKey(row);
          return (
            <option key={key} value={key}>
              {row.project_slug}/{row.slug} ({row.kind}, {row.region})
            </option>
          );
        })}
      </select>
      {environmentsError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-destructive" role="alert">
            {environmentsError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingEnvironments || disabled}
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Provision runs on the control-plane worker for the selected environment.
        </p>
      )}
    </div>
  );
}
