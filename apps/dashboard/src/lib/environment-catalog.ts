import { fetchEnvironments } from "@/lib/api";
import type { EnvironmentOption } from "@/lib/types";

/** Shared loader for Deploy form + deployment list/detail labels. */
export async function loadEnvironmentCatalog(): Promise<EnvironmentOption[]> {
  const page = await fetchEnvironments();
  return page.items;
}
