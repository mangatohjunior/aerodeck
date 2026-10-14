import { connection, NextResponse } from "next/server";

import { jsonError } from "@/lib/mock-http";
import { createDeployment, listDeployments } from "@/lib/mock-store";

export async function GET() {
  await connection();
  return NextResponse.json(listDeployments());
}

export async function POST(request: Request) {
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
    const deployment = createDeployment(payload.repo_url);
    return NextResponse.json(deployment, { status: 201 });
  } catch {
    return jsonError(
      400,
      "Enter a GitHub URL like https://github.com/org/repo",
      "invalid_github_url",
    );
  }
}
