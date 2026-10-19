"use client";

import { useEffect, useState } from "react";

import { loadEnvironmentCatalog } from "@/lib/environment-catalog";
import { environmentOptionKey } from "@/lib/environment-option";
import type { EnvironmentOption } from "@/lib/types";

export function useDeployEnvironments(enabled: boolean) {
  const [environmentKey, setEnvironmentKey] = useState("");
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [environmentsError, setEnvironmentsError] = useState<string | null>(null);
  const [loadingEnvironments, setLoadingEnvironments] = useState(enabled);
  const [reloadToken, setReloadToken] = useState(0);

  function reload() {
    setReloadToken((token) => token + 1);
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    setLoadingEnvironments(true);
    setEnvironmentsError(null);
    loadEnvironmentCatalog()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setEnvironments(items);
        if (items.length === 1) {
          setEnvironmentKey(environmentOptionKey(items[0]));
          return;
        }
        const keys = new Set(items.map(environmentOptionKey));
        setEnvironmentKey((current) => (keys.has(current) ? current : ""));
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
  }, [enabled, reloadToken]);

  return {
    environmentKey,
    setEnvironmentKey,
    environments,
    environmentsError,
    loadingEnvironments,
    reload,
  };
}
