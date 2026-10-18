"use client";

import { useEffect, useState } from "react";

import { fetchEnvironments } from "@/lib/api";
import type { EnvironmentOption } from "@/lib/types";

export function useDeployEnvironments(enabled: boolean) {
  const [environmentKey, setEnvironmentKey] = useState("");
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [environmentsError, setEnvironmentsError] = useState<string | null>(null);
  const [loadingEnvironments, setLoadingEnvironments] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    setLoadingEnvironments(true);
    setEnvironmentsError(null);
    fetchEnvironments()
      .then((page) => {
        if (cancelled) {
          return;
        }
        setEnvironments(page.items);
        if (page.items.length === 1) {
          setEnvironmentKey(`${page.items[0].project_id}:${page.items[0].id}`);
        }
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setEnvironmentsError(cause instanceof Error ? cause.message : "Could not load environments.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingEnvironments(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    environmentKey,
    setEnvironmentKey,
    environments,
    environmentsError,
    loadingEnvironments,
  };
}
