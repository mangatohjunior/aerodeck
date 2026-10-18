import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  createControlPlaneDeployment,
  listControlPlaneDeployments,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";

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

  let payload: { repo_url?: unknown };
  try {
    payload = (await request.json()) as { repo_url?: unknown };
  } catch {
    return jsonError(400, "Request body must be JSON.", "invalid_json");
  }
  if (typeof payload.repo_url !== "string" || payload.repo_url.trim() === "") {
    return jsonError(400, "repo_url is required.", "missing_repo_url");
  }

  try {
    const deployment = await createControlPlaneDeployment(config, payload.repo_url);
    return NextResponse.json(deployment, { status: 201 });
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.message.includes("rejected (422)")) {
      return jsonError(400, "Enter a GitHub URL like https://github.com/org/repo", "invalid_github_url");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_deployment_create_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
