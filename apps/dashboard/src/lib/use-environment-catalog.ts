"use client";

import { useEffect, useState } from "react";

import { loadEnvironmentCatalog } from "@/lib/environment-catalog";
import type { EnvironmentOption } from "@/lib/types";

/** Best-effort environment catalog for deployment labels (warns, never throws). */
export function useEnvironmentCatalog(enabled: boolean): EnvironmentOption[] {
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);

  useEffect(() => {
    if (!enabled) {
      setEnvironments([]);
      return;
    }
    let cancelled = false;
    loadEnvironmentCatalog()
      .then((items) => {
        if (!cancelled) {
          setEnvironments(items);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        console.warn(
          "event=deployment_environment_catalog_failed detail=%s",
          cause instanceof Error ? cause.message : "request failed",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return environments;
}
