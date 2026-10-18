import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  createControlPlaneDeploymentAndProvision,
  isControlPlaneUuid,
  listControlPlaneDeployments,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";
import { PROVISION_ENQUEUE_FAILED } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Deployments stay on the mock API.", "not_found");
  }

  try {
    const items = await listControlPlaneDeployments(config);
    return NextResponse.json(items);
  } catch (cause) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_deployments_failed detail=%s", detail);
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
    return jsonError(404, "Deployments stay on the mock API.", "not_found");
  }

  let payload: {
    repo_url?: unknown;
    project_id?: unknown;
    environment_id?: unknown;
  };
  try {
    payload = (await request.json()) as {
      repo_url?: unknown;
      project_id?: unknown;
      environment_id?: unknown;
    };
  } catch {
    return jsonError(400, "Request body must be JSON.", "invalid_json");
  }
  if (typeof payload.repo_url !== "string" || payload.repo_url.trim() === "") {
    return jsonError(400, "repo_url is required.", "missing_repo_url");
  }

  const projectId = typeof payload.project_id === "string" ? payload.project_id.trim() : "";
  const environmentId =
    typeof payload.environment_id === "string" ? payload.environment_id.trim() : "";
  // Enrolled create always queues provision so empty-log stub Done cannot mark succeeded.
  if (projectId.length === 0 || environmentId.length === 0) {
    return jsonError(
      400,
      "project_id and environment_id are required.",
      "missing_environment",
    );
  }
  if (!isControlPlaneUuid(projectId) || !isControlPlaneUuid(environmentId)) {
    return jsonError(400, "project_id and environment_id must be UUIDs.", "invalid_target_ids");
  }

  try {
    const deployment = await createControlPlaneDeploymentAndProvision(config, {
      repoUrl: payload.repo_url,
      projectId,
      environmentId,
    });
    return NextResponse.json(deployment, { status: 201 });
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.deploymentId) {
      const status = cause.status === 503 ? 503 : 502;
      console.error(
        "event=console_provision_enqueue_failed deployment_id=%s detail=%s",
        cause.deploymentId,
        cause.message,
      );
      return NextResponse.json(
        {
          detail: "Deployment was created but provision could not be queued.",
          code: PROVISION_ENQUEUE_FAILED,
          deployment_id: cause.deploymentId,
        },
        { status },
      );
    }
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      // Pre-create failures only (post-create 404s carry deploymentId above).
      return jsonError(404, "Environment was not found.", "not_found");
    }
    if (cause instanceof ControlPlaneError && cause.status === 422) {
      return jsonError(400, "Enter a GitHub URL like https://github.com/org/repo", "invalid_github_url");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_deployment_create_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
