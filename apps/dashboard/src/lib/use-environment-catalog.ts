"use client";

import { useEffect, useState } from "react";

import { fetchEnvironments } from "@/lib/api";
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
    fetchEnvironments()
      .then((page) => {
        if (!cancelled) {
          setEnvironments(page.items);
        }
      })
      .catch((cause: unknown) => {
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
