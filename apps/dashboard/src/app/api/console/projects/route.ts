import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  createControlPlaneProject,
  listControlPlaneProjects,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { listProjects } from "@/lib/mock-store";
import {
  isValidProjectName,
  isValidProjectSlug,
  normalizeProjectDescription,
  PROJECT_DESCRIPTION_MAX,
} from "@/lib/project-input";
import { requireSessionUser } from "@/lib/session";
import type { ProjectPage } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    const items = listProjects();
    const page: ProjectPage = {
      items,
      total: items.length,
      limit: Math.max(items.length, 1),
      offset: 0,
      source: "mock",
    };
    return NextResponse.json(page);
  }

  try {
    const page = await listControlPlaneProjects(config);
    const body: ProjectPage = { ...page, source: "control-plane" };
    return NextResponse.json(body);
  } catch (cause) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_projects_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}

export async function POST(request: Request) {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Projects stay on the mock API.", "not_found");
  }

  let payload: { slug?: unknown; name?: unknown; description?: unknown };
  try {
    payload = (await request.json()) as {
      slug?: unknown;
      name?: unknown;
      description?: unknown;
    };
  } catch {
    return jsonError(400, "Request body must be JSON.", "invalid_json");
  }

  if (typeof payload.slug !== "string" || typeof payload.name !== "string") {
    return jsonError(400, "slug and name are required.", "missing_fields");
  }

  const slug = payload.slug.trim();
  const name = payload.name.trim();
  if (!isValidProjectSlug(slug)) {
    return jsonError(
      400,
      "Use a lowercase slug with letters, digits, and hyphens (no leading or trailing hyphen).",
      "invalid_slug",
    );
  }
  if (!isValidProjectName(name)) {
    return jsonError(400, "Enter a project name (1–120 characters).", "invalid_name");
  }

  let description: string | null = null;
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== "string") {
      return jsonError(400, "description must be a string.", "invalid_description");
    }
    description = normalizeProjectDescription(payload.description);
    if (description !== null && description.length > PROJECT_DESCRIPTION_MAX) {
      return jsonError(400, "description is too long.", "invalid_description");
    }
  }

  try {
    const project = await createControlPlaneProject(config, { slug, name, description });
    return NextResponse.json(project, { status: 201 });
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 409) {
      return jsonError(409, "That slug is already taken.", "slug_taken");
    }
    if (cause instanceof ControlPlaneError && cause.status === 422) {
      return jsonError(
        400,
        "Use a lowercase slug with letters, digits, and hyphens (no leading or trailing hyphen).",
        "invalid_slug",
      );
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_project_create_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
