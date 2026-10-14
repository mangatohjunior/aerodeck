import { connection } from "next/server";

import { jsonError } from "@/lib/mock-http";
import { getDeployment } from "@/lib/mock-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  const deployment = getDeployment(id);
  if (!deployment) {
    return jsonError(404, "Deployment not found.", "not_found");
  }
  return Response.json(deployment);
}
